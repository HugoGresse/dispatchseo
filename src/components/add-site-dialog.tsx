"use client";

import { useActionState, useEffect, useRef, useState, startTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { addSiteAndStartSetup, type WizardCreateState } from "@/app/actions";

// Adding a site from inside the dashboard, as a dialog.
//
// It used to be a link to /new -> /onboarding?new=1, which dropped an existing
// customer into the full-screen first-run wizard: no sidebar, no switcher, no
// way back. Worse on cloud, where ?new=1 was ignored and the wizard resumed the
// ACTIVE project's saved screen - so "add a site" opened someone else's
// finished setup and re-fired its pipeline install ("GitHub App not
// installed"). The wizard is right for a first-run account that has no
// dashboard yet; a customer who already has one shouldn't be thrown out of it
// to type two fields.
//
// So this collects what creating the row needs - name, domain, and the repo on
// self-host, which has no GitHub App to pick one with - and then hands off to
// the wizard at the step right after "add your site" to finish: GitHub, Search
// Console, publish mode, pipeline install.
//
// It hands off rather than reimplementing, because two of those steps leave the
// page entirely (the App install and Google's consent screen) and come back
// through the wizard's resume path. A dialog can't survive that round trip; the
// wizard already does, and it's the same flow the first site went through.
//
// What it must NOT do is stop at the row and leave the rest to the Home setup
// cards. A project with no pipeline has no workflows, so nothing researches,
// builds, or publishes for it - it only looks real in the switcher. Adding a
// site and setting it up are one act.
export function AddSiteDialog({
  open,
  onClose,
  cloud,
}: {
  open: boolean;
  onClose: () => void;
  // Self-host has no GitHub App to pick a repo with, and Settings only
  // DISPLAYS github_repo (read-only InfoRow) - so outside cloud the repo can
  // only be set at creation or over MCP. The old wizard made it required at
  // step 1 for exactly that reason; this dialog has to keep that promise or
  // it hands a docker owner a site the UI can never attach a repo to.
  cloud: boolean;
}) {
  const [state, formAction, pending] = useActionState<WizardCreateState, FormData>(
    addSiteAndStartSetup,
    null,
  );
  const nameRef = useRef<HTMLInputElement>(null);
  // React 19 RESETS a form once its action resolves - so a rejected submit
  // (unreachable domain, duplicate site, plan full) handed the error back with
  // every field blanked, and the owner got to retype all of it to fix one
  // typo. Worse, the retry then silently no-opped: the emptied required field
  // failed native validation before the action ever ran. Both seen in a
  // browser, 2026-07-26.
  //
  // Controlled state alone does NOT fix it - the reset clears the DOM input
  // while the state still holds the old value, so React sees no change and
  // never re-renders to put it back. The reset only happens when the action is
  // passed to <form action={...}>; calling it inside a transition ourselves
  // (see onSubmit) keeps the fields exactly as typed.
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [repo, setRepo] = useState("");
  // Portalled to <body> on purpose. The switcher lives in a sticky header with
  // backdrop-blur, and a backdrop-filter makes its element the containing block
  // for position:fixed descendants - rendered in place, this overlay would be
  // positioned against the 56px header and clipped by it instead of covering
  // the viewport. Mounted-gated because document doesn't exist during SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // createProjectCore already switched the dash_project cookie to the new site,
  // so refreshing the current route re-renders every server component against
  // it - the owner lands on the NEW site's dashboard, setup cards and all,
  // without a navigation. Same pattern the project switch above uses.
  // Fire once per successful submit, not once per render. useActionState keeps
  // returning the same ok state forever, and onClose arrives as an inline arrow
  // whose identity changes every render - so without this guard the effect
  // re-ran and slammed the dialog shut the instant it was reopened, making
  // "Add project" work exactly once per page load. Comparing the state OBJECT
  // (not a boolean) still lets a genuinely new success re-trigger it.
  const handledRef = useRef<WizardCreateState>(null);
  useEffect(() => {
    if (!state || !("ok" in state) || !state.ok || handledRef.current === state) return;
    handledRef.current = state;
    // Clear before leaving: the fields are controlled, so without this the
    // next "Add site" opens pre-filled with the site just created.
    setName("");
    setDomain("");
    setRepo("");
    onClose();
    // Into the wizard, not back to the dashboard. The row exists but nothing
    // runs for it yet - no repo, no Search Console, no workflows - and the
    // action has parked it on the screen right after "add your site", so this
    // continues the same setup the first site got instead of leaving the owner
    // to discover what's still missing.
    //
    // A full load rather than router.push: this effect closes the dialog in the
    // same tick, and the push made from the unmounting subtree silently never
    // navigated (seen in a browser, 2026-07-26 - the dialog closed and the page
    // stayed put). It also guarantees the wizard's server render reads the
    // dash_project cookie createProjectCore just repointed, instead of risking
    // a cached segment for the previous project - the same staleness the
    // project switcher works around with a refresh.
    window.location.assign("/onboarding");
  }, [state, onClose]);

  useEffect(() => {
    if (!open) return;
    nameRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, pending]);

  if (!open || !mounted) return null;

  const error = state && "error" in state ? state.error : null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-10 backdrop-blur-sm"
      onMouseDown={(e) => {
        // Only a click that both starts and ends on the backdrop dismisses -
        // a drag that began inside the form shouldn't throw the form away.
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-site-title"
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl shadow-black/60"
      >
        <h2 id="add-site-title" className="text-lg font-semibold text-white">
          Add a site
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">
          {cloud
            ? "Then setup continues here: connecting your repo, Search Console, and publishing - the same few minutes your first site took."
            : "Then setup continues here: Search Console, publishing, and installing the pipeline in your repo - the same few minutes your first site took."}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startTransition(() => formAction(data));
          }}
          className="mt-5 space-y-4"
        >
          {/* Defaults that the row needs and later screens own: mode is
              switchable from the header, content layout is detected during
              install. Asking here would make a two-field dialog a five-field one. */}
          <input type="hidden" name="mode" value="semi" />
          <input type="hidden" name="content_mode" value="detect" />

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-neutral-300">Site name</span>
            <input
              ref={nameRef}
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
              placeholder="Acme"
              autoComplete="off"
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-violet-500/50 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-neutral-300">Domain</span>
            <input
              name="domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              required
              placeholder="acme.com"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-violet-500/50 focus:outline-none"
            />
            <span className="mt-1.5 block text-xs text-neutral-500">
              The live site, without https:// - we check it answers before saving it.
            </span>
          </label>

          {/* Cloud picks the repo through the GitHub App later, so asking here
              would be a field the owner has to answer twice. */}
          {!cloud ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-neutral-300">GitHub repo</span>
              <input
                name="repo"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                required
                placeholder="owner/repo"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-violet-500/50 focus:outline-none"
              />
              <span className="mt-1.5 block text-xs text-neutral-500">
                The repo DispatchSEO opens pull requests against. A full GitHub URL works too.
              </span>
            </label>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="cursor-pointer rounded-lg px-3 py-2 text-sm text-neutral-400 transition-colors hover:text-neutral-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="cursor-pointer rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950 transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Adding..." : "Add site"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

// Opens the dialog from ?add=1 so anything outside the switcher can point at
// it with a plain link - /new redirects here rather than to the wizard, and a
// bookmarked URL keeps working. The param is stripped on open so a refresh
// (or Back) doesn't reopen a dialog the owner already dismissed.
export function useAddSiteParam(onOpen: () => void) {
  const params = useSearchParams();
  const router = useRouter();
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current || params.get("add") !== "1") return;
    fired.current = true;
    onOpen();
    const next = new URLSearchParams(params.toString());
    next.delete("add");
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
  }, [params, router, onOpen]);
}
