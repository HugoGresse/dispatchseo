import Link from "next/link";
import { CopyBlock } from "@/components/client";

// The guide that points a Claude-app owner at the next thing to press.
//
// A coding-agent project runs itself once the pipeline is in; a Claude-app
// project is driven by the owner pasting one sentence into claude.ai at each
// stage, and Home used to say nothing about which stage they were at - the
// maintainer walked the flow himself on 2026-08-20 and could not tell what to
// do next. Every step here is derived from data (did the chat app reach us,
// is there a profile, are there ideas, is one approved, is an article in),
// carries the exact sentence to paste or the exact screen to open, and the
// whole card leaves on its own once the first article is live.

export type ChatStep = {
  title: string;
  done: boolean;
  /** What to do when it is not done - a sentence to paste, or a screen. */
  paste?: string;
  href?: string;
  linkLabel?: string;
  hint?: string;
};

export function ChatNextSteps({ steps, aiName }: { steps: ChatStep[]; aiName: string }) {
  const next = steps.findIndex((s) => !s.done);
  return (
    <section className="rounded-xl border border-violet-500/25 bg-violet-500/[0.05] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-300/90">
        Your next step
      </p>
      <p className="mt-1 text-sm leading-relaxed text-neutral-400">
        {aiName} does the research and the writing; you approve ideas and paste one sentence at
        each stage. This list ticks itself as you go.
      </p>
      <ol className="mt-4 space-y-3">
        {steps.map((s, i) => {
          const current = i === next;
          return (
            <li key={s.title} className="flex gap-3">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  s.done
                    ? "bg-emerald-500/20 text-emerald-300"
                    : current
                      ? "bg-violet-500 text-neutral-950"
                      : "bg-neutral-800 text-neutral-400"
                }`}
                aria-hidden="true"
              >
                {s.done ? "✓" : i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <p
                  className={`text-sm ${
                    s.done ? "text-neutral-500 line-through" : current ? "font-medium text-neutral-100" : "text-neutral-400"
                  }`}
                >
                  {s.title}
                </p>
                {current && s.hint ? (
                  <p className="text-[13px] leading-relaxed text-neutral-400">{s.hint}</p>
                ) : null}
                {current && s.paste ? <CopyBlock text={s.paste} /> : null}
                {current && s.href ? (
                  <Link
                    href={s.href}
                    className="inline-flex items-center rounded-lg bg-neutral-100 px-3 py-1.5 text-[13px] font-medium text-neutral-900 transition-opacity hover:opacity-90"
                  >
                    {s.linkLabel ?? "Open"}
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
