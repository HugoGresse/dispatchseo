"use client";

import { useMemo, useState, useTransition } from "react";
import {
  setFeedbackHiddenAction,
  setFeedbackStatusAction,
  submitFeedbackAction,
  toggleVoteAction,
} from "@/app/feedback-actions";
import { SelectWrap } from "@/components/ui";
import { BODY_MAX, TITLE_MAX, TITLE_MIN } from "@/lib/feedback-limits";
import type { FeedbackItem, FeedbackStatus } from "@/lib/feedback";

// The /feedback screen. Two exports, one composer:
//   FeedbackBoard    - CLOUD_MODE. Write a request, vote on everyone else's.
//   FeedbackSoloForm - self-host. Write a request, it gets emailed on, thanks.
//
// Type imports only from lib/feedback (`import type` is erased at compile
// time), so the service-role client it imports never follows this into the
// browser bundle.

// ---- small pieces ---------------------------------------------------------

function CaretUp({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m6 15 6-6 6 6" />
    </svg>
  );
}

function SpinnerDot() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}

const STATUS_STYLE: Record<FeedbackStatus, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-neutral-800 text-neutral-300" },
  planned: { label: "Planned", className: "bg-sky-500/15 text-sky-300" },
  in_progress: { label: "In progress", className: "bg-amber-500/15 text-amber-300" },
  shipped: { label: "Shipped", className: "bg-emerald-500/15 text-emerald-300" },
  declined: { label: "Not planned", className: "bg-neutral-800/60 text-neutral-500" },
};

const ALL_STATUSES: FeedbackStatus[] = ["open", "planned", "in_progress", "shipped", "declined"];

function StatusPill({ status }: { status: FeedbackStatus }) {
  const s = STATUS_STYLE[status];
  // "Open" is the default state of every request and saying so on every card
  // is noise - the pill earns its place only once the owner has actually
  // touched the row.
  if (status === "open") return null;
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}

// Coarse on purpose: both the server render and the browser render compute
// this from their own clock, and anything finer than a minute would disagree
// across that boundary and trip a hydration warning.
function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

// ---- the composer ---------------------------------------------------------

// One control in both modes. Collapsed it is a single line, which is the whole
// bet on "easy": the cost of asking for something is one click and one
// sentence. The detail box and the submit row only appear once there is
// something to submit.
function Composer({
  placeholder,
  cta,
  onDone,
}: {
  placeholder: string;
  cta: string;
  onDone: (res: { emailed: boolean; mailto: string | null }) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const expanded = open || title.length > 0;
  const tooLong = title.length > TITLE_MAX || body.length > BODY_MAX;
  const canSend = title.trim().length >= TITLE_MIN && !tooLong && !pending;

  function send() {
    if (!canSend) return;
    setError(null);
    startTransition(async () => {
      const res = await submitFeedbackAction(title, body);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTitle("");
      setBody("");
      setOpen(false);
      onDone(res.data);
    });
  }

  return (
    <div className="rounded-xl border border-neutral-800/80 bg-neutral-900 p-4 focus-within:border-neutral-700">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          // Enter sends from the one-line state, so the fastest possible
          // request is: click, type, Enter.
          if (e.key === "Enter" && !e.shiftKey && canSend) {
            e.preventDefault();
            send();
          }
        }}
        maxLength={TITLE_MAX + 40}
        placeholder={placeholder}
        aria-label="What should we build"
        className="w-full bg-transparent text-[15px] text-neutral-100 outline-none placeholder:text-neutral-500"
      />

      {expanded ? (
        <div className="mt-3 space-y-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={BODY_MAX + 200}
            placeholder="Any detail worth having? What are you trying to do, and what gets in the way? (optional)"
            className="w-full resize-y rounded-lg bg-neutral-950/60 p-3 text-sm leading-relaxed text-neutral-200 outline-none ring-1 ring-neutral-800 placeholder:text-neutral-500 focus:ring-neutral-700"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-neutral-500">
              Plain text only - links and email addresses are turned away.
            </p>
            <div className="flex items-center gap-3">
              {title.length > TITLE_MAX - 25 || body.length > BODY_MAX - 100 ? (
                <span className={`text-xs tabular-nums ${tooLong ? "text-rose-400" : "text-neutral-500"}`}>
                  {title.length > TITLE_MAX - 25
                    ? `${title.length}/${TITLE_MAX}`
                    : `${body.length}/${BODY_MAX}`}
                </span>
              ) : null}
              <button
                type="button"
                onClick={send}
                disabled={!canSend}
                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
              >
                {pending ? <SpinnerDot /> : null}
                {cta}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-rose-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ---- one request on the board --------------------------------------------

function Card({
  item,
  isAdmin,
  onVote,
  onAdmin,
}: {
  item: FeedbackItem;
  isAdmin: boolean;
  onVote: (id: string) => void;
  onAdmin: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const long = item.body.length > 260;

  return (
    <div
      className={`flex gap-3 rounded-xl border border-neutral-800/80 bg-neutral-900 p-4 transition-colors hover:border-neutral-700/80 ${
        item.hidden ? "opacity-50" : ""
      }`}
    >
      {/* The vote control owns the left edge at a size you cannot miss - it is
          the one thing most people will ever do on this screen. */}
      <button
        type="button"
        onClick={() => onVote(item.id)}
        aria-pressed={item.voted}
        aria-label={`${item.voted ? "Remove your vote from" : "Vote for"} ${item.title}`}
        className={`flex h-16 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 ${
          item.voted
            ? "border-violet-500/60 bg-violet-500/10 text-violet-300"
            : "border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
        }`}
      >
        <CaretUp className="h-4 w-4" />
        <span className="text-base font-semibold tabular-nums">{item.votes}</span>
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          {/* whitespace-pre-wrap + break-words: it is user text, so it may be
              one 400-character word, and a grid child that wide takes the
              whole page into horizontal scroll. */}
          <h3 className="min-w-0 break-words font-medium text-neutral-100">{item.title}</h3>
          <StatusPill status={item.status} />
        </div>

        {item.body ? (
          <p
            className={`mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-400 ${
              long && !expanded ? "line-clamp-3" : ""
            }`}
          >
            {item.body}
          </p>
        ) : null}
        {long ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 text-xs font-medium text-neutral-400 hover:text-neutral-200"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
          <span>{ago(item.created_at)}</span>
          {item.mine ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-neutral-400">yours</span>
            </>
          ) : null}
          {item.hidden ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-amber-400">hidden</span>
            </>
          ) : null}
        </div>

        {isAdmin ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-800/80 pt-3">
            <label className="sr-only" htmlFor={`status-${item.id}`}>
              Status
            </label>
            <SelectWrap>
              <select
                id={`status-${item.id}`}
                value={item.status}
                onChange={(e) => onAdmin(() => setFeedbackStatusAction(item.id, e.target.value))}
                className="appearance-none rounded-lg border border-neutral-800 bg-neutral-950 py-1.5 pl-2.5 pr-7 text-xs text-neutral-300 outline-none focus:border-neutral-600"
              >
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_STYLE[s].label}
                  </option>
                ))}
              </select>
            </SelectWrap>
            <button
              type="button"
              onClick={() => onAdmin(() => setFeedbackHiddenAction(item.id, !item.hidden))}
              className="rounded-lg border border-neutral-800 px-2.5 py-1.5 text-xs text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-200"
            >
              {item.hidden ? "Unhide" : "Hide"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---- the board (CLOUD_MODE) ----------------------------------------------

type Sort = "top" | "new";

export function FeedbackBoard({
  items: initial,
  isAdmin,
}: {
  items: FeedbackItem[];
  isAdmin: boolean;
}) {
  // Server state is the source of truth; this holds the optimistic version
  // between a click and the revalidate that confirms it.
  const [items, setItems] = useState(initial);
  const [sort, setSort] = useState<Sort>("top");
  const [filter, setFilter] = useState<FeedbackStatus | "all">("all");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Re-sync when the server sends a fresh list (a revalidate after any write).
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setItems(initial);
  }

  const shown = useMemo(() => {
    const list = items.filter((i) => (filter === "all" ? true : i.status === filter));
    return sort === "top"
      ? [...list].sort((a, b) => b.votes - a.votes || +new Date(b.created_at) - +new Date(a.created_at))
      : [...list].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [items, sort, filter]);

  function vote(id: string) {
    setError(null);
    // Move the number before the round trip - a vote that waits on the network
    // feels broken, and the server's answer overwrites this either way.
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, voted: !i.voted, votes: i.votes + (i.voted ? -1 : 1) } : i,
      ),
    );
    startTransition(async () => {
      const res = await toggleVoteAction(id);
      if (!res.ok) {
        // Put it back exactly as it was, and say why - a vote that silently
        // rolls back reads as the button being broken.
        setItems((prev) =>
          prev.map((i) =>
            i.id === id ? { ...i, voted: !i.voted, votes: i.votes + (i.voted ? -1 : 1) } : i,
          ),
        );
        setError(res.error);
        return;
      }
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, voted: res.data.voted, votes: res.data.votes } : i)),
      );
    });
  }

  function runAdmin(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "That didn't work.");
    });
  }

  const counts = useMemo(() => {
    const m = new Map<FeedbackStatus, number>();
    for (const i of items) m.set(i.status, (m.get(i.status) ?? 0) + 1);
    return m;
  }, [items]);

  const chips: { value: FeedbackStatus | "all"; label: string }[] = [
    { value: "all", label: "All" },
    ...ALL_STATUSES.filter((s) => (counts.get(s) ?? 0) > 0).map((s) => ({
      value: s as FeedbackStatus | "all",
      label: STATUS_STYLE[s].label,
    })),
  ];

  return (
    <div className="space-y-5">
      <Composer
        placeholder="What should DispatchSEO do next?"
        cta="Post request"
        onDone={() => setNotice("Posted. It's on the board.")}
      />

      {notice ? (
        <p role="status" className="text-sm text-emerald-400">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-rose-400">
          {error}
        </p>
      ) : null}

      {items.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setFilter(c.value)}
                aria-pressed={filter === c.value}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === c.value
                    ? "bg-neutral-100 text-neutral-900"
                    : "bg-neutral-900 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-neutral-800 p-0.5">
            {(["top", "new"] as Sort[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSort(s)}
                aria-pressed={sort === s}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  sort === s ? "bg-neutral-800 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {s === "top" ? "Most wanted" : "Newest"}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {shown.length === 0 ? (
        <div className="rounded-xl bg-neutral-900/60 px-4 py-10 text-center text-sm text-neutral-400">
          {items.length === 0
            ? "Nothing here yet. Ask for the first thing."
            : "Nothing with that status yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((item) => (
            <Card key={item.id} item={item} isAdmin={isAdmin} onVote={vote} onAdmin={runAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- the solo form (self-host) -------------------------------------------

export function FeedbackSoloForm() {
  const [sent, setSent] = useState<{ emailed: boolean; mailto: string | null } | null>(null);

  if (sent) {
    return (
      <div className="rounded-xl border border-neutral-800/80 bg-neutral-900 p-6">
        {sent.emailed ? (
          <>
            <p className="text-[15px] font-medium text-neutral-100">Sent - thank you.</p>
            <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">
              It went straight to the people who build DispatchSEO. Requests that keep coming up
              are the ones that get built.
            </p>
          </>
        ) : (
          <>
            {/* The row is saved either way, but saying "thanks!" over a message
                that never left the building is the exact failure this project
                does not ship. Say what happened, and hand over the way out. */}
            <p className="text-[15px] font-medium text-neutral-100">Saved, but not sent.</p>
            <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">
              This install has no email configured (<code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs">RESEND_API_KEY</code>),
              so it could not pass your request on. It is stored here, and this link sends it
              from your own mail app:
            </p>
            {sent.mailto ? (
              <a
                href={sent.mailto}
                className="mt-3 inline-flex rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
              >
                Email it instead
              </a>
            ) : null}
          </>
        )}
        <button
          type="button"
          onClick={() => setSent(null)}
          className="mt-4 block text-sm font-medium text-neutral-400 hover:text-neutral-200"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <Composer
      placeholder="What should DispatchSEO do next?"
      cta="Send request"
      onDone={(res) => setSent(res)}
    />
  );
}
