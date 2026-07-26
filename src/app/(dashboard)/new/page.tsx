import { redirect } from "next/navigation";

// The classic add-project form got replaced by the onboarding wizard, and then
// the wizard got replaced - for an owner who ALREADY has a dashboard - by the
// add-site dialog. This URL keeps working for bookmarks either way.
//
// It pointed at /onboarding?new=1 until 2026-07-26. That was wrong twice: it
// threw a paying customer out of the dashboard into the chrome-less first-run
// wizard, and on cloud ?new=1 was ignored entirely (buildCloudResume keys off
// the ACTIVE project), so "add a site" rendered another project's finished
// setup and re-fired its pipeline install.
//
// force-dynamic keeps the redirect out of build-time prerender - it would
// otherwise render the dashboard layout (which reads the DB) during
// `next build`, making CI builds fail without env (the pipeline's
// build-verify runs envless).
export const dynamic = "force-dynamic";

export default function NewProjectPage() {
  // ?add=1 is read by the switcher's dialog, which lives in the dashboard
  // layout and is therefore mounted on whatever page this lands on.
  redirect("/dashboard?add=1");
}
