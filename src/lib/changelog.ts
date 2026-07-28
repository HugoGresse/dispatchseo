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
    version: "2026-07-28",
    date: "2026-07-28",
    title: "Windows works out of the box",
    summary:
      "Every command DispatchSEO asks you to paste now has a Windows (PowerShell) version, and the connect prompt names your project's server exactly.",
    changes: [
      {
        kind: "new",
        text:
          "Install and restart from plain PowerShell: the quickstart has a Windows paste, and " +
          "start.cmd in the install folder boots the stack from any Windows terminal (or a " +
          "double-click) - no Git Bash needed.",
      },
      {
        kind: "improved",
        text:
          "Commands the wizard and dashboard ask you to paste on your own computer now show " +
          "Mac/Linux and Windows (PowerShell) tabs, defaulting to your system, and the final " +
          "wizard step spells out where each paste goes.",
      },
      {
        kind: "fixed",
        text:
          "The 'paste into Claude Code' prompt named a server (seo-manager) that doesn't match " +
          "what the connect command registers (dispatchseo-<your site>), so a fresh agent " +
          "session could refuse to start. Every prompt now uses your project's exact server name.",
      },
    ],
  },
  {
    version: "2026-07-27.3",
    date: "2026-07-27",
    title: "Your queue refills itself, and setup tells the truth",
    summary:
      "The builder no longer sits idle when the idea queue empties, and the jobs that used to fail quietly now say so.",
    changes: [
      {
        kind: "new",
        text:
          "If your guide queue ever runs empty, research now starts on its own instead of " +
          "waiting for the next weekly run - so a delayed or dropped schedule can't cost you " +
          "a day's post. Still at most one research run a day.",
      },
      {
        kind: "fixed",
        text:
          "Approving a tool, or connecting a brand-new site, could silently do nothing for the " +
          "rest of the day if that day's scheduled run had already happened. Both start " +
          "immediately now.",
      },
      {
        kind: "fixed",
        text:
          "If the GitHub app loses access to your repo, the dashboard now tells you and links " +
          "the fix. Before, merges and approvals just stopped working with nothing to see.",
      },
      {
        kind: "fixed",
        text:
          "Setup could drop you on the final screen having skipped Search Console, your keyword " +
          "source and publish mode. It now resumes exactly where you left off.",
      },
      {
        kind: "improved",
        text:
          "Self-hosted installs: the dashboard is now reachable only from the machine running " +
          "Docker unless you deliberately open it up, matching what the VPS guide always said.",
      },
    ],
  },
  {
    version: "2026-07-27.2",
    date: "2026-07-27",
    title: "Rank tracking that never runs out of budget",
    summary:
      "Smarter, much cheaper SERP checks - and if spend ever runs hot, tracking slows down instead of stopping.",
    changes: [
      {
        kind: "improved",
        text:
          "Rank checks moved to a smarter schedule: keywords ranking in the top 30 are still " +
          "checked every day, and everything gets a full-depth sweep (including Google AI " +
          "Overview citations) every Monday. Same charts, a fraction of the DataForSEO cost.",
      },
      {
        kind: "new",
        text:
          "Budget pacing: if a project's DataForSEO spend is on track to hit its monthly " +
          "budget, checks automatically thin to every-other-day (then weekly) instead of " +
          "cutting out mid-month. The Billing page shows when pacing is active.",
      },
      {
        kind: "improved",
        text:
          "Domain Rating now refreshes weekly - it moves on a monthly scale, and the daily " +
          "re-check was paid money for a number that almost never changed overnight.",
      },
    ],
  },
  {
    version: "2026-07-27",
    date: "2026-07-27",
    title: "A nudge to install Claude for Chrome",
    summary:
      "The \"Get it on Google\" card now points new users at the Chrome extension it needs.",
    changes: [
      {
        kind: "improved",
        text:
          "The indexing card links straight to the Claude for Chrome install page the first " +
          "time it shows up, so the paste-and-go step actually works on the first try.",
      },
    ],
  },
  {
    version: "2026-07-26.4",
    date: "2026-07-26",
    title: "Setup can't touch the wrong site",
    summary:
      "Opening the setup page no longer starts installing into a site you didn't pick.",
    changes: [
      {
        kind: "fixed",
        text:
          "Opening the setup page could start installing the pipeline into whichever site DispatchSEO happened to think was active - committing files and writing a secret to that site's repo without anyone pressing a button. It happened because a site with no saved setup progress landed straight on the final screen, which starts the install by itself. Setup now opens on the Connect GitHub step instead, and only reaches the finish line if you actually walked there.",
      },
      {
        kind: "fixed",
        text:
          "Choosing a repo, saving your Claude token, and installing the pipeline now each name the site they're for. Before, they used whichever site was active, so a stale browser session could have pointed your token or your repo at the wrong one.",
      },
    ],
  },
  {
    version: "2026-07-26.3",
    date: "2026-07-26",
    title: "Deleting a site now actually ends it",
    summary:
      "Deleting a project takes DispatchSEO back out of the connected repo instead of leaving its workflows running.",
    changes: [
      {
        kind: "fixed",
        text:
          "Deleting a project only ever deleted our side of it. The workflows we committed to your repo kept running on schedule, failing against a project that no longer existed, and emailing you about it - with an error blaming DispatchSEO rather than the delete you asked for. Deleting now disables and removes those workflows, the .dispatchseo files, and the SEO_MCP_API_KEY secret.",
      },
      {
        kind: "improved",
        text:
          "Your content is never part of that cleanup. Published guides and tools, the page templates the setup run built, and your sitemap wiring all stay exactly where they are - only our machinery is removed.",
      },
      {
        kind: "new",
        text:
          "Moving a site to another DispatchSEO install? Tick \"leave the repo alone\" when you delete, and the pipeline keeps working while the old project goes away.",
      },
      {
        kind: "improved",
        text:
          "Closing your account cleans out every connected repo the same way, and tells you on the way out if any repo could not be reached.",
      },
    ],
  },
  {
    version: "2026-07-26.2",
    date: "2026-07-26",
    title: "Getting in, and getting out",
    summary:
      "Sign-up and confirmation links actually work now, Settings says which account you're in, and you can close the account yourself.",
    changes: [
      {
        kind: "fixed",
        text:
          "Signing up with an address that already had an account showed \"check your inbox\" for an email that was never sent. It now says the account exists and points you at signing in.",
      },
      {
        kind: "fixed",
        text:
          "The confirmation link in that email dropped you on the homepage instead of signing you in. It now takes you straight into your dashboard.",
      },
      {
        kind: "fixed",
        text:
          "\"Continue with Google\" quietly reused whichever Google account you last signed in with, so a second account could land you in the first one. It asks which account now.",
      },
      {
        kind: "new",
        text: "Settings shows which account you're signed in as.",
      },
      {
        kind: "new",
        text:
          "You can close your account from Settings. It cancels your plan first and removes your sites, and if the cancellation doesn't go through, nothing is deleted.",
      },
      {
        kind: "improved",
        text:
          "Deleting your only site now warns you that it doesn't cancel your plan, and with no sites left the sidebar stops offering links that bounce you back to the wizard.",
      },
    ],
  },
  {
    version: "2026-07-26",
    date: "2026-07-26",
    title: "A shorter, clearer setup",
    summary: "One less screen to click through, and the GitHub step now says what it actually does.",
    changes: [
      {
        kind: "improved",
        text:
          "Setup no longer stops to show you the keys it generated - you go straight into the wizard. Both keys are on Settings whenever you want them.",
      },
      {
        kind: "improved",
        text:
          "The GitHub step is called Connect GitHub, and it's honest about skipping: on a Docker install the bundled builder needs that token to reach your repo at all.",
      },
      {
        kind: "fixed",
        text:
          "Reinstalling on a site whose repo was already set up used to leave setup waiting forever. It now finishes on its own.",
      },
      {
        kind: "fixed",
        text:
          "Self-hosted auto-merge now holds back any pull request that touches files outside your publishing folders, matching what the hosted version has always done.",
      },
    ],
  },
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
