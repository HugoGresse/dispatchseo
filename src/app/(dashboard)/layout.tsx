import Link from "next/link";
import { cookies } from "next/headers";
import { MobileNav, PageTitle, Sidebar } from "@/components/nav";
import { ChangelogBanner } from "@/components/changelog-banner";
import { CHANGELOG_COOKIE, unseenRelease } from "@/lib/changelog";
import { DispatchMark } from "@/components/logo";
import { ProjectSwitcher } from "@/components/project-switcher";
import { ModeSwitch } from "@/components/mode-switch";
import { getActiveProjectOrNull, scopedProjects } from "@/lib/active-project";
import { isCloudMode } from "@/lib/cloud";
import { SetupProgressBanner } from "@/components/setup-progress-banner";

// Shared shell for every dashboard screen. Auth is checked per page (the
// requireDashboard gate in auth-gate.ts) - this layout is presentation only. force-dynamic
// covers the whole group: everything behind the password gate is
// per-request, and it keeps `next build` from prerendering pages that read
// the DB (CI's build-verify runs with no env at all).
export const dynamic = "force-dynamic";
// Vercel-style chrome: a full-height icon sidebar owns the left edge (brand
// at the top),
// and the topbar (project switcher / centered page title) only spans the
// content column, so the sidebar visually cuts through it. Mobile hides the
// sidebar, shows the brand in the topbar, and swaps in a horizontal nav.

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // scopedProjects: only the signed-in user's projects in CLOUD_MODE. active
  // is null for a cloud account with no projects yet - the page itself
  // redirects to the wizard (getActiveProject), the layout just renders a
  // chrome without switcher/mode for that one request.
  const [projects, active, jar] = await Promise.all([
    scopedProjects(),
    getActiveProjectOrNull(),
    cookies(),
  ]);

  const billing = isCloudMode();
  // Cloud unlocks the dashboard as soon as a repo is connected (onboarding-gate),
  // so the owner can explore while the background setup run personalizes their
  // site. Show a top banner in exactly that window - repo connected but the run
  // hasn't stamped pipeline_installed_at yet - so the half-filled dashboard
  // reads as "still setting up", not "broken".
  // Top progress banner: during setup (pipeline not installed yet) AND the
  // first-data window after install, while the auto-fired research + rank checks
  // are still landing. BOTH branches are time-bounded so long-established
  // projects don't mount a permanent polling banner on every load; the banner
  // itself also hides the moment ideas + a rank check exist.
  const POST_INSTALL_WINDOW = 6 * 3_600_000; // first-data window after install
  const SETUP_WINDOW = 24 * 3_600_000; // an install that hasn't landed in a day isn't "in progress"
  const installedAt = active?.pipeline_installed_at
    ? new Date(active.pipeline_installed_at).getTime()
    : null;
  // When onboarding actually began: the GitHub App install, else the project's
  // creation. A legacy/default project (repo connected before pipeline_installed_at
  // tracking existed, so it stayed null) and a long-abandoned setup both have an
  // OLD clock here - so the null-installed branch below no longer treats them as
  // "still setting up" and no longer shows the banner forever.
  const setupStartedAt = active?.github_app_installed_at
    ? new Date(active.github_app_installed_at).getTime()
    : active?.created_at
      ? new Date(active.created_at).getTime()
      : null;
  const setupInProgress =
    billing &&
    active != null &&
    Boolean(active.github_repo) &&
    (installedAt != null
      ? Date.now() - installedAt < POST_INSTALL_WINDOW
      : setupStartedAt != null && Date.now() - setupStartedAt < SETUP_WINDOW);
  // "DispatchSEO has been updated" - the newest release this browser hasn't
  // acknowledged yet. Silent for projects created after it shipped (nothing is
  // "new" to an owner who never saw the old version).
  const release = unseenRelease(jar.get(CHANGELOG_COOKIE)?.value, active?.created_at);
  return (
    <div className="flex min-h-screen bg-neutral-950 text-neutral-100">
      <Sidebar billing={billing} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* One row on every size. Desktop keeps the three-up grid (switcher /
            centered title / mode). Mobile can't: at 390px the centered title
            landed on top of the project domain, so it drops out there - the
            page's own h1 already names the screen - and the hamburger takes
            its place on the left. The wordmark also goes; the mark alone links
            home and the drawer carries the full brand. */}
        <header className="sticky top-0 z-20 border-b border-neutral-800/80 bg-neutral-950/90 backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-4 sm:px-6 md:grid md:grid-cols-[1fr_auto_1fr]">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 md:flex-none md:gap-2">
              <MobileNav billing={billing} />
              <Link href="/dashboard" className="shrink-0 md:hidden" aria-label="DispatchSEO home">
                <DispatchMark className="h-7 w-auto" />
              </Link>
              {active && (
                <ProjectSwitcher
                  projects={projects.map((p) => ({ slug: p.slug, name: p.name, domain: p.domain }))}
                  activeSlug={active.slug}
                />
              )}
            </div>
            <div className="hidden md:block">
              <PageTitle />
            </div>
            <div className="flex shrink-0 items-center justify-end">
              {active && <ModeSwitch mode={active.mode} />}
            </div>
          </div>
        </header>
        {setupInProgress && active ? (
          <SetupProgressBanner
            slug={active.slug}
            repo={active.github_repo}
            since={active.github_app_installed_at}
            installed={active.pipeline_installed_at != null}
          />
        ) : release ? (
          // Only when setup ISN'T running: two stacked banners is one too many,
          // and mid-setup the owner has something better to watch.
          <ChangelogBanner version={release.version} summary={release.summary} />
        ) : null}
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
