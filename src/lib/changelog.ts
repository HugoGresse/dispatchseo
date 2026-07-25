// The product changelog - what shipped in DispatchSEO itself, in the owner's
// language. Same serve-content-from-the-backend pattern as the agent
// instructions (src/lib/instructions/) and the backlink playbook: content IS
// state, it lives here, and every surface (the dashboard banner, /changelog,
// the get_changelog MCP tool) reads this one list.
//
// Adding a release: prepend an entry. `version` is the anchor id and the value
// stored in the "seen" cookie, so it must be unique and must never be reused
// or reordered - a returning owner is shown the banner exactly when the newest
// version differs from what their browser last acknowledged.
//
// Write for the owner, not the commit log: name the thing they'd notice, not
// the module that changed. Skip releases with nothing user-visible - a silent
// week is better than a banner about an internal refactor.

export type ChangeKind = "new" | "improved" | "fixed";

export type ChangelogEntry = {
  /** Unique, sortable, never reused: `YYYY-MM-DD`, or `YYYY-MM-DD.N` for a same-day second release. */
  version: string;
  /** ISO date the release went out. */
  date: string;
  /** Headline - a few words, sentence case. */
  title: string;
  /** One line for the banner: what changed, in the owner's terms. */
  summary: string;
  changes: { kind: ChangeKind; text: string }[];
};

// Newest first. The head of this list is what the banner announces.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "2026-07-25",
    date: "2026-07-25",
    title: "Updates apply themselves",
    summary:
      "Pipeline updates now install in the background instead of asking you to do anything.",
    changes: [
      {
        kind: "improved",
        text:
          "When your site repo's SEO workflows fall behind, we push the new version through the DispatchSEO GitHub App automatically - no prompt to paste, no banner to read.",
      },
      {
        kind: "new",
        text: "This changelog, plus a heads-up on the dashboard whenever something ships.",
      },
      {
        kind: "improved",
        text: "Signed in already? The landing page sends you straight to your dashboard.",
      },
    ],
  },
  {
    version: "2026-07-24",
    date: "2026-07-24",
    title: "A calmer dashboard",
    summary: "Quieter onboarding, a new look, and failure emails that actually reach you.",
    changes: [
      { kind: "new", text: "New pixel-art walkie mark across the app, favicon, and share images." },
      {
        kind: "new",
        text: "One background-work banner during first run, replacing the pile of setup cards - and Log out is finally in the sidebar.",
      },
      {
        kind: "improved",
        text: "Switching projects shows a loading state instead of appearing to freeze.",
      },
      {
        kind: "fixed",
        text: "When a background job fails on a hosted project, the email goes to you, not just to us.",
      },
      {
        kind: "fixed",
        text: "No more false \"your secrets are wrong\" alerts while setup is still running.",
      },
    ],
  },
  {
    version: "2026-07-23",
    date: "2026-07-23",
    title: "Get in while setup runs",
    summary: "The dashboard opens as soon as your repo is connected, mid-setup.",
    changes: [
      {
        kind: "new",
        text: "Connect the repo and start exploring - a top banner tracks the setup run instead of locking you out until it finishes.",
      },
      {
        kind: "fixed",
        text: "Search Console on hosted projects syncs through your own Google connection, so your data lands even without granting us service-account access.",
      },
      {
        kind: "fixed",
        text: "Email confirmation links land on the right page instead of a 404.",
      },
    ],
  },
];

export const LATEST = CHANGELOG[0];

/** Anchor id for an entry - `/changelog#v-2026-07-25`. */
export function anchorFor(version: string): string {
  return `v-${version}`;
}

export const CHANGELOG_COOKIE = "ds_whats_new";

// Versions are echoed back from the client (the dismiss action) and used as
// cookie values, so they get the same shape check both ways.
export function isVersionString(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(\.\d+)?$/.test(v);
}

// Whether to announce a release to this visitor. Two ways to stay quiet:
//   - they've already acknowledged this version (the cookie), or
//   - the release predates their project, so it isn't news to them - a brand
//     new signup should not be greeted with "DispatchSEO has been updated!".
// The cookie is per-browser, not per-account: a returning owner on a new
// device may see one release announced twice. That's the cheap tradeoff for
// not putting a per-user row behind this.
export function unseenRelease(
  seenVersion: string | undefined,
  projectCreatedAt: string | null | undefined,
): ChangelogEntry | null {
  const latest = LATEST;
  if (!latest) return null;
  if (seenVersion && seenVersion >= latest.version) return null;
  if (projectCreatedAt) {
    const created = new Date(projectCreatedAt).getTime();
    // Compare against the end of the release day: an entry dated the same day
    // the project was created still counts as pre-existing.
    const released = new Date(`${latest.date}T23:59:59Z`).getTime();
    if (Number.isFinite(created) && created > released) return null;
  }
  return latest;
}
