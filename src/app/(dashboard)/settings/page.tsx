import { requireDashboard } from "@/lib/auth-gate";
import { headers } from "next/headers";
import { instanceCronSecret } from "@/lib/dashboard-auth";
import { mcpAddCommand, mcpAddCommandPS } from "@/lib/mcp-connect";
import { requestOrigin } from "@/lib/request-origin";
import { ShellCommandTabs } from "@/components/shell-command-tabs";
import { getActiveProjectOrNull } from "@/lib/active-project";
import { credsForProject } from "@/lib/dataforseo";
import { DEFAULT_PROJECT_ID, fetchProjectToken } from "@/lib/projects";
import { isCloudMode } from "@/lib/cloud";
import { ClaudeTokenConnect } from "@/components/claude-token-connect";
import { hasRepoSecret } from "@/lib/github-app-secrets";
import { DeleteProjectForm } from "@/components/delete-project";
import { DeleteAccountForm } from "@/components/delete-account";
import { KeywordSourceSettings } from "@/components/keyword-source-settings";
import { SiteLaunchedRow } from "@/components/site-launched";
import { CopyBlock } from "@/components/client";
import { PageHeader, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";
// Server actions run under the invoking page's limit, and this page owns the
// delete actions - which now walk a customer repo (disable ~11 workflows,
// commit a removal, delete a secret) BEFORE the row is deleted. The default
// 10s could cut that off mid-teardown, which would leave the project intact
// but its workflows half-disabled, so give the danger zone real headroom.
export const maxDuration = 60;

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
      <span className="text-sm text-neutral-400">{label}</span>
      <span className="text-sm text-neutral-100">{value}</span>
    </div>
  );
}

// Which account this browser is signed in to. Account-level, not project-level,
// so it renders even when there is no site - and it is the answer to "am I in
// the right account", which nothing in the dashboard used to state anywhere.
function AccountSection({ email }: { email: string | null }) {
  return (
    <section className="space-y-3">
      <SectionTitle sub="the account this dashboard is signed in to">Account</SectionTitle>
      <div className="divide-y divide-neutral-800/70 rounded-xl bg-neutral-900 px-4 py-1.5 sm:px-5">
        <InfoRow label="Signed in as" value={email ?? "no email on file"} />
      </div>
    </section>
  );
}

export default async function SettingsPage() {
  const auth = await requireDashboard();

  // Account-level facts, resolved once: both the last-site warning and the
  // close-account form need them, and they must be available on the no-project
  // branch below too. Null on self-host, which has no accounts.
  const user = auth.user;
  const account = user
    ? await (async () => {
        const [{ getSubscription, isActive }, { scopedProjects }] = await Promise.all([
          import("@/lib/billing"),
          import("@/lib/active-project"),
        ]);
        const [mine, sub] = await Promise.all([scopedProjects(), getSubscription(user.id)]);
        return { email: user.email, siteCount: mine.length, subscribed: isActive(sub) };
      })()
    : null;

  // OrNull, not getActiveProject: this page has to survive owning no site.
  // getActiveProject would bounce to the wizard, which is where someone who
  // just deleted their last project already is - so the one screen that says
  // which account they are in would be the one screen they cannot open.
  // Self-host has no accounts (auth.user is null), so it skips the section.
  const project = await getActiveProjectOrNull();
  if (!project) {
    return (
      <div className="mx-auto max-w-xl space-y-8">
        <PageHeader
          title="Settings"
          hint="Add a site to configure it. Your account details are below either way."
        />
        {auth.user ? <AccountSection email={auth.user.email} /> : null}
        <section className="space-y-3">
          <SectionTitle sub="nothing to configure until a site exists">Site settings</SectionTitle>
          <div className="rounded-xl bg-neutral-900 px-4 py-4 text-sm leading-relaxed text-neutral-400 sm:px-5">
            You don&apos;t have a site yet.{" "}
            <a
              href="/onboarding?new=1"
              className="font-medium text-violet-400 underline underline-offset-2 hover:text-violet-300"
            >
              Add one
            </a>{" "}
            and its settings appear here. To change or cancel your plan, open{" "}
            <a
              href="/billing"
              className="font-medium text-violet-400 underline underline-offset-2 hover:text-violet-300"
            >
              Billing
            </a>
            .
          </div>
        </section>
        {account ? (
          <section className="space-y-3">
            <SectionTitle sub="irreversible - read before you click">Danger zone</SectionTitle>
            <div className="rounded-xl border border-red-500/25 bg-neutral-900 p-4 sm:p-5">
              <DeleteAccountForm
                email={account.email}
                siteCount={account.siteCount}
                subscribed={account.subscribed}
              />
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  const isDefault = project.id === DEFAULT_PROJECT_ID;
  const mcpToken = await fetchProjectToken(project.id);
  // Whether a Claude Code token is already stored on the repo, so Settings can
  // say "you're done, this is only for rotating" instead of looking like a
  // required first-time setup. GitHub never returns secret values, only
  // existence; fail closed (treat as not-set) on any error.
  const claudeTokenSet =
    isCloudMode() && project.github_installation_id
      ? await hasRepoSecret(project, "CLAUDE_CODE_OAUTH_TOKEN").catch(() => false)
      : false;
  // Self-host only: the cron secret is INSTANCE-wide, not per-project, so in
  // cloud it would hand every tenant the platform's own key. Null on a classic
  // env install (no instance row) - the section just doesn't render.
  const cronSecret = isCloudMode() ? null : await instanceCronSecret();
  // Deleting the last site leaves a paying account with no dashboard to reach
  // Billing from, so the danger zone has to say that up front. Self-host has
  // no subscription and can't delete the home project anyway, hence cloud-only.
  const lastSiteWhileSubscribed =
    isCloudMode() && account?.siteCount === 1 && account.subscribed;
  const hdrs = await headers();
  const dashOrigin = requestOrigin(hdrs);

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <PageHeader
        title="Project settings"
        hint={`Everything DispatchSEO knows about ${project.name}. Switch projects from the header to manage a different one.`}
      />

      {auth.user ? <AccountSection email={auth.user.email} /> : null}

      <section className="space-y-3">
        <SectionTitle>Project</SectionTitle>
        <div className="divide-y divide-neutral-800/70 rounded-xl bg-neutral-900 px-4 py-1.5 sm:px-5">
          <InfoRow label="Name" value={project.name} />
          <InfoRow label="Domain" value={project.domain} />
          <InfoRow label="GitHub repo" value={project.github_repo ?? "not connected"} />
          <InfoRow label="Search Console property" value={project.gsc_site_url ?? "not connected"} />
          <InfoRow
            label="DataForSEO"
            value={
              project.dataforseo_login
                ? `connected (${project.dataforseo_login})`
                : (await credsForProject(project))
                  ? "connected (platform account)"
                  : project.keyword_source === "dataforseo"
                    ? "not connected - see the setup card on Home"
                    : `not used - this project runs on ${project.keyword_source === "serpapi" ? "a free SerpApi key" : "Search Console only (free)"}`
            }
          />
          <InfoRow
            label="Mode"
            value={project.mode === "auto" ? "Auto - hands-off publishing" : "Semi - you approve and merge"}
          />
          {/* Feeds the site-age readout (Journey) - 0015 backfills it from
              created_at, so pre-existing sites need this corrected once. */}
          <SiteLaunchedRow
            current={project.site_launched_at ?? project.created_at}
            slug={project.slug}
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle
          sub={
            isCloudMode()
              ? "where rank checks and keyword research come from - DataForSEO, included in your plan"
              : "where rank checks and keyword research come from - the onboarding choice, switchable anytime"
          }
        >
          Keyword data source
        </SectionTitle>
        <KeywordSourceSettings
          current={project.keyword_source}
          hasDataforseoCreds={Boolean(project.dataforseo_login && project.dataforseo_password)}
          bundledDataforseo={isCloudMode()}
          cloud={isCloudMode()}
          hasSerpapiKey={Boolean(project.serpapi_key)}
        />
      </section>

      {isCloudMode() && project.github_installation_id ? (
        <section className="space-y-3">
          <SectionTitle sub="the token builds run on - rotate it here whenever it expires or gets revoked">
            Claude Code token
          </SectionTitle>
          <ClaudeTokenConnect connected={claudeTokenSet} slug={project.slug} />
        </section>
      ) : null}

      {mcpToken ? (
        <section className="space-y-3">
          <SectionTitle sub="what the CI workflows and Claude Code use to talk to this project - every call made with it only sees this project's data">
            Project key
          </SectionTitle>
          <CopyBlock text={mcpToken} />
          <p className="text-sm text-neutral-400">
            Connect Claude Code to this project (the server name carries the project slug, so
            every connected site keeps its own entry):
          </p>
          <ShellCommandTabs
            bash={mcpAddCommand(project.slug, dashOrigin, mcpToken)}
            powershell={mcpAddCommandPS(project.slug, dashOrigin, mcpToken)}
            box="card"
          />
        </section>
      ) : null}

      {cronSecret ? (
        <section className="space-y-3">
          <SectionTitle sub="what the scheduled jobs use to call this backend - the pipeline install writes it into your repo as a secret, so you should never need to paste it by hand">
            Cron key
          </SectionTitle>
          <CopyBlock text={cronSecret} />
        </section>
      ) : null}

      <section className="space-y-3">
        <SectionTitle sub="irreversible - read before you click">Danger zone</SectionTitle>
        <div className="space-y-3 rounded-xl border border-red-500/25 bg-neutral-900 p-4 sm:p-5">
          {isDefault ? (
            <p className="text-sm text-neutral-400">
              This is the home project - it can&apos;t be deleted.
            </p>
          ) : (
            <>
              <p className="text-sm text-neutral-400">
                Deleting {project.name} forgets everything DispatchSEO tracked for it: keywords,
                rank history, suggestions, the pages registry, traffic snapshots, playbook
                progress, and the product profile. There is no undo.
              </p>
              <DeleteProjectForm
                slug={project.slug}
                domain={project.domain}
                repo={project.github_repo}
                lastSiteWhileSubscribed={lastSiteWhileSubscribed}
              />
            </>
          )}
          {/* Closing the whole account, below deleting one site: a heavier
              action reached from the same place, but folded away so it isn't
              the first red control the eye lands on. */}
          {account ? (
            <div className="border-t border-neutral-800 pt-3">
              <DeleteAccountForm
                email={account.email}
                siteCount={account.siteCount}
                subscribed={account.subscribed}
              />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
