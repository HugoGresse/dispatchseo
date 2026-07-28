import { redirect, unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { requireDashboard } from "@/lib/auth-gate";
import { verifyState } from "@/lib/gsc-oauth";
import { getProjectBySlug } from "@/lib/projects";
import { assertInstallationClaimable, assertProjectOwned } from "@/lib/tenant-guard";
import {
  callerControlsInstallation,
  getInstallation,
  installationClaimable,
  listInstallationRepos,
  makeInstallNonce,
  userAuthConfigured,
} from "@/lib/github-app";
import { db } from "@/lib/db";
import { isCloudMode } from "@/lib/cloud";

// GitHub redirects here after the App install/update flow. With "Request user
// authorization (OAuth) during installation" enabled, this URL is the App's
// "User authorization callback URL"; it is also set as the Setup URL, which
// only matters for the update redirect. (GitHub's docs say the Setup URL field
// is not even enterable once OAuth-on-install is ticked - an acknowledged gap
// in their own documentation. Pointing both at this route sidesteps it.)
//
// Three arrivals, and they do NOT resolve the same way:
//   setup_action=install  fresh install. Carries an OAuth `code`, plus our
//                         signed `state` when the flow began at our own
//                         /api/github/install/start. This is the only path
//                         that binds an installation to a project.
//   setup_action=update   repos added/removed from GitHub's settings UI.
//                         Carries NEITHER state NOR code - GitHub does not run
//                         the authorization step for an update - and needs no
//                         write. Handled first, below.
//   setup_action=request  org member asked an owner to approve. Nothing is
//                         installed yet and no code exists.
//
// state only comes back when the flow started at our own
// /api/github/install/start (the wizard's "Connect GitHub" button, which
// signs the originating project's slug into it) - a bare "Install" click
// from github.com/apps/... arrives with no state at all, so that path is
// handled separately below.
//
// getInstallation() is not optional plumbing: installation_id is a caller-
// supplied, unauthenticated query param at this point. Without checking it
// against the App's own installations list, anyone could point this route at
// an installation_id belonging to a completely different app/org and get it
// wired into their project.

export async function GET(req: Request): Promise<Response> {
  await requireDashboard();
  // GitHub App install is cloud-only (self-host uses the merge token). 404 out
  // like the other cloud-only API routes - defense in depth.
  if (!isCloudMode()) return NextResponse.json({ error: "not found" }, { status: 404 });

  const url = new URL(req.url);
  const installationIdRaw = url.searchParams.get("installation_id");
  const state = url.searchParams.get("state");
  // "install" | "update" | "request". Undocumented on docs.github.com (GitHub
  // Support confirms it only in support threads), so it is treated as a hint
  // and never as the sole basis for a decision.
  const setupAction = url.searchParams.get("setup_action");

  const installationId = installationIdRaw ? Number(installationIdRaw) : NaN;

  try {
    if (!Number.isFinite(installationId)) {
      redirect("/onboarding?gh=error&msg=bad-installation-id");
    }

    // UPDATE redirects are handled before either branch below, because they
    // satisfy neither one's assumptions. When someone adds or removes a repo
    // from an existing installation via GitHub's own settings UI, "Redirect on
    // update" sends them here with installation_id + setup_action=update and
    // NOTHING ELSE - no signed state (they never came from our link) and no
    // OAuth code (GitHub does not run the authorization step for an update;
    // its docs promise `code` only for the install flow). Falling through
    // would demand the proof code and answer "install-not-yours" for what is a
    // completely routine permission change (2026-07-27).
    //
    // Nothing needs writing on this path either: the installation is already
    // bound to whichever project claimed it, and repo membership is read live
    // from GitHub every time we use it. So resolve it to a plain redirect.
    //
    // Safe against a forged setup_action=update carrying a victim's id: the
    // only outcome is a redirect to a page the caller can already reach. No
    // row is written, no binding is created, and the response is identical
    // whether or not the id is known to us.
    if (setupAction === "update") {
      const { data: bound } = await db()
        .from("projects")
        .select("id")
        .eq("github_installation_id", installationId)
        .limit(1);
      if ((bound ?? []).length > 0) redirect("/dashboard");
      // Not bound to anything we know about - fall through and let the normal
      // claim path decide, proof code and all.
    }

    // An org member requesting an install they cannot approve themselves gets
    // setup_action=request: nothing is installed yet and GitHub issues no code,
    // so there is genuinely nothing to claim. Say that plainly instead of
    // failing the proof check with a misleading "not yours".
    if (setupAction === "request") {
      redirect(`/onboarding?gh=error&msg=${encodeURIComponent("Your organization still has to approve the DispatchSEO app. Once an owner approves it, come back and click Install again.")}`);
    }

    const slug = state ? await verifyState(state) : null;

    if (slug) {
      const project = await getProjectBySlug(slug);
      if (!project) redirect("/onboarding?gh=error&msg=unknown-project");
      await assertProjectOwned(project.id);
      // installation_id is an enumerable integer from the query string; state
      // proves the caller owns the PROJECT, not the installation. Refuse one
      // already bound to another tenant, or a signed-in attacker could wire a
      // victim's installation into their own project and write to the
      // victim's repo through our App.
      await assertInstallationClaimable(installationId);

      // Proof that the human who just clicked Install controls THIS installation.
      // GitHub's setup redirect is unsigned, so without this the only checks were
      // "do you own the project you are writing into" and "is this installation
      // fresh" - neither of which says the installation is yours. With user
      // authorization enabled on the App, GitHub sends a one-time `code`; it
      // exchanges for a token belonging to the installer, whose
      // GET /user/installations lists what they can actually administer.
      //
      // No code at all means GITHUB's redirect did not carry one - an App
      // CONFIGURATION fact about us, not evidence about the caller. Failing
      // closed on it blocked every legitimate install the moment the client
      // credentials were set (2026-07-28, launch morning). Absence now falls
      // through to the freshness/suspension gate, which is exactly the
      // protection that shipped before the OAuth proof existed and still closes
      // every orphan-installation class. A code that IS present and does not
      // verify is real evidence, and still fails closed.
      const proofCode = url.searchParams.get("code") ?? "";
      if (!proofCode && userAuthConfigured()) {
        console.error(
          `[github-install] no ?code on the callback for installation ${installationId} ` +
            `(setup_action=${setupAction ?? "none"}, state=${state ? "present" : "none"}). ` +
            `Falling back to the freshness gate. Check that "Request user authorization (OAuth) ` +
            `during installation" is enabled on the App and that its Callback URL points here.`,
        );
      }
      if (proofCode && !(await callerControlsInstallation(proofCode, installationId))) {
        redirect(`/onboarding?gh=error&msg=${encodeURIComponent("We could not confirm that this GitHub installation belongs to you. Install the app from this page's button so we can verify it, rather than from github.com directly.")}`);
      }

      const installation = await getInstallation(installationId);
      // One generic message for BOTH "not our App's installation" and "not
      // claimable right now". Distinct replies made this endpoint an oracle:
      // probe an id, read which error came back, learn whether it belongs to
      // DispatchSEO - free reconnaissance for picking a hijack target.
      if (!installation || !installationClaimable(installation)) {
        redirect("/onboarding?gh=error&msg=install-not-found");
      }

      const repos = await listInstallationRepos(installationId);
      const patch: Record<string, unknown> = {
        github_installation_id: installationId,
        github_app_installed_at: new Date().toISOString(),
      };
      // Exactly one repo -> auto-attach it; anything else (owner picked
      // "all repos", multiple, or somehow zero) needs the owner to choose.
      // Never overwrite a repo already chosen: a later App reinstall/update
      // (e.g. granting a different single repo) must not silently repoint an
      // already-connected project - same guard as attachGithubInstallation.
      if (repos.length === 1 && !project.github_repo) patch.github_repo = repos[0].full_name;

      const { error } = await db().from("projects").update(patch).eq("id", project.id);
      if (error) redirect("/onboarding?gh=error&msg=save-failed");

      redirect(repos.length === 1 ? "/onboarding?gh=installed" : "/onboarding?gh=pick_repo");
    }

    // No usable state: installed straight from github.com (or the signed
    // state expired). Confirm the installation is genuinely ours, then hand
    // off to the wizard's interrupt screen to ask which project it's for -
    // nothing is written yet, so an install can't get silently attached to
    // the wrong tenant.
    // Proof that the human who just clicked Install controls THIS installation.
    // GitHub's setup redirect is unsigned, so without this the only checks were
    // "do you own the project you are writing into" and "is this installation
    // fresh" - neither of which says the installation is yours. With user
    // authorization enabled on the App, GitHub sends a one-time `code`; it
    // exchanges for a token belonging to the installer, whose
    // GET /user/installations lists what they can actually administer.
    //
    // Enforced only when the App is configured for it, so self-host and any
    // deployment without the client credentials keeps working on the freshness
    // gate alone. When it IS configured the code is REQUIRED - accepting a
    // missing code would hand every attacker a one-parameter downgrade back to
    // the weaker path.
    // Same reasoning as the state path above: a missing code is our
    // configuration, a failing code is the caller's problem.
    const proofCode = url.searchParams.get("code") ?? "";
    if (!proofCode && userAuthConfigured()) {
      console.error(
        `[github-install] no ?code on the stateless callback for installation ${installationId} ` +
          `(setup_action=${setupAction ?? "none"}). Falling back to the freshness gate.`,
      );
    }
    if (proofCode && !(await callerControlsInstallation(proofCode, installationId))) {
      redirect(`/onboarding?gh=error&msg=${encodeURIComponent("We could not confirm that this GitHub installation belongs to you. Install the app from this page's button so we can verify it, rather than from github.com directly.")}`);
    }

    const installation = await getInstallation(installationId);
    if (!installation || !installationClaimable(installation)) {
      redirect("/onboarding?gh=error&msg=install-not-found");
    }
    // No signed state proves WHO installed this. Drop an httpOnly HMAC nonce
    // tying THIS browser to THIS installation_id; attachGithubInstallation
    // requires it back, so a signed-in attacker guessing the (enumerable) id
    // can't bind a victim's fresh install to their own project.
    const res = NextResponse.redirect(
      new URL(`/onboarding?gh=pick_project&installation_id=${installationId}`, req.url),
    );
    res.cookies.set("gh_install_nonce", await makeInstallNonce(installationId), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor((15 * 60 * 1000) / 1000),
    });
    return res;
  } catch (e) {
    unstable_rethrow(e); // let the redirect()s above pass through untouched
    console.error(
      `[github-app] install callback failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    redirect("/onboarding?gh=error&msg=callback-failed");
  }
}
