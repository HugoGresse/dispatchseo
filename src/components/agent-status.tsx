"use client";

// "next build in 3h 20m" - the one line on Home that says a specific thing is
// going to happen at a specific time without anyone doing anything. It used to
// be the second half of the agent heartbeat pill; the dispatcher's briefing has
// taken over the heartbeat, so what survives here is the part the briefing
// can't render: a countdown.
//
// It has to be a client component and it has to gate on mount. The countdown
// targets the daily builder's cron (05:00 UTC, see seo-daily.yml in the
// pipeline pack), so the text depends on the reader's clock - server HTML that
// carried a time would mismatch on hydration. Nothing renders until mounted,
// the same pattern NextUpdate uses.

import { useEffect, useState } from "react";

function nextBuildUtc(now: number): number {
  const d = new Date(now);
  const today5 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 5);
  return now < today5 ? today5 : today5 + 86_400_000;
}

function countdown(ms: number): string {
  if (ms <= 60_000) return "next build any minute";
  const min = Math.ceil(ms / 60_000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return m > 0 ? `next build in ${h}h ${m}m` : `next build in ${h}h`;
  return `next build in ${m}m`;
}

export function NextBuildCountdown() {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (now == null) return null;
  const target = nextBuildUtc(now);
  return (
    <span
      title={`the daily builder picks up the top approved idea ~${new Date(target).toLocaleString()}`}
    >
      {countdown(target - now)}
    </span>
  );
}
