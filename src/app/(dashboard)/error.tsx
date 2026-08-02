"use client";

// Dashboard-scoped error boundary. The root one (src/app/error.tsx) sits ABOVE
// (dashboard)/layout.tsx, so a throw on any single screen replaced the sidebar,
// topbar, project switcher and every banner with a bare retry card - the only
// way out was the browser back button. This one lives inside the group layout,
// so the chrome survives and the customer can just navigate to a page that
// works.
//
// The copy also stops over-promising. The root version says "no automation is
// impacted", which is not knowable from here: getActiveProject throws on a
// degraded projects read, and that same outage is entirely capable of stopping
// the crons too. Say what is true and what to do instead.

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-6">
      <div className="max-w-md space-y-4 rounded-lg border border-neutral-800 bg-neutral-900/50 p-6 text-center">
        <h2 className="text-lg font-semibold text-neutral-100">This page didn&apos;t load</h2>
        <p className="text-sm text-neutral-400">
          Usually a brief hiccup reading your data. Try again - if it keeps failing, the other
          pages in the sidebar still work, and your automations run on the backend either way.
        </p>
        {/* In production React redacts the message to a generic string, so the
            digest is the only thing worth quoting to support - show it as such
            rather than inviting the customer to "report the message below". */}
        <p className="rounded bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-500">
          {error.digest ? `Reference: ${error.digest}` : error.message || "unknown error"}
        </p>
        <button
          onClick={reset}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
