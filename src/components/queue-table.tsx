"use client";

// The two build queues on Research, as draggable lists. Div-based (a <tr>
// can't be transformed smoothly) but styled to read exactly like TableShell:
// same neutral-900 card, px/py rhythm, micro-headers, divider lines. CSS
// subgrid keeps every row's columns aligned to one shared template, so it
// still scans like a table.
//
// Reordering is OPTIMISTIC: the on-screen order is committed the instant you
// drop, and reorderQueue() persists in a background transition. Local order
// stays authoritative for the session; if the save fails, we fall back to the
// server order and show a small amber line. Only approved rows carry a grip -
// pending/in_progress rows sit where the sort put them.

import { useMemo, useRef, useState, useTransition } from "react";
import { reorderQueue } from "@/app/actions";
import { QueueApproveButton, QueueBuildNowButton, QueueRemoveButton } from "@/components/client";
import { CardList, DataCard } from "@/components/ui";

export type QueueRow = {
  id: string;
  title: string;
  primary_keyword: string | null;
  keyword_volume: number | null;
  keyword_difficulty: number | null;
  status: string;
};

// Approved needs no label (the row being here says it all); the two states
// that DO carry information get one. Mirrors QueueStatus from the old table.
//
// A pending row used to read "optional" on Auto, on the theory that the agent
// had already queued the winners so anything left over was a bonus. That
// stopped being true when the research ladder's promote-to-hit-quota rung
// closed for sites under DR 20: nothing promotes these on its own any more, so
// a pending row IS waiting on the owner - on Auto just as much as on Semi. It
// says "pending" in both modes now, muted on Auto (nothing is owed today; the
// approved queue still ships without you) and amber on Semi (the queue does
// not move until you decide). Either way the row carries the NUMBER behind the
// decision, because "why isn't this approved?" is the only real question here.
function StatusLabel({
  status,
  autoApproved,
  kd,
  kdCeiling,
}: {
  status: string;
  autoApproved?: boolean;
  kd?: number | null;
  // The project's current auto-approve KD line (kd-zones.ts). Null when no
  // domain-rating snapshot exists yet - then we show no ceiling rather than
  // assert one we cannot back.
  kdCeiling?: number | null;
}) {
  if (status === "in_progress") return <span className="text-neutral-300">building now</span>;
  if (status === "pending") {
    const reason =
      kd == null
        ? "no difficulty score"
        : kdCeiling != null && kd >= kdCeiling
          ? `KD ${kd}, over your ceiling of ${kdCeiling}`
          : null;
    return (
      <span className="flex flex-col gap-0.5">
        <span className={autoApproved ? "text-neutral-400" : "text-amber-300"}>pending</span>
        {reason ? <span className="text-xs text-neutral-500">{reason}</span> : null}
      </span>
    );
  }
  return <span className="text-neutral-400">queued</span>;
}

// The classic two-column grip dots.
function GripIcon() {
  return (
    <svg viewBox="0 0 10 16" className="h-4 w-2.5" fill="currentColor" aria-hidden="true">
      {[2, 8, 14].map((cy) => (
        <g key={cy}>
          <circle cx="2.5" cy={cy} r="1.4" />
          <circle cx="7.5" cy={cy} r="1.4" />
        </g>
      ))}
    </svg>
  );
}

// One-step reorder control for the mobile card list (the desktop grid uses the
// drag grip instead). 36px square so it clears the touch-target floor.
function MoveButton({
  dir,
  disabled,
  onClick,
}: {
  dir: "up" | "down";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "up" ? "Move up in the queue" : "Move down in the queue"}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-800 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200 disabled:pointer-events-none disabled:opacity-30"
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
        <path d={dir === "up" ? "M8 13V3M4 7l4-4 4 4" : "M8 3v10M4 9l4 4 4-4"} />
      </svg>
    </button>
  );
}

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

type Drag = { index: number; overIndex: number; dy: number };

export function DraggableQueue({
  kind,
  rows,
  autoApproved = false,
  kdCeiling = null,
}: {
  kind: "guide" | "tool";
  rows: QueueRow[];
  // Auto-approval on for this queue's type -> a pending row is muted rather
  // than amber: the approved queue still ships without the owner, so nothing
  // is owed TODAY. It still needs them eventually (see StatusLabel).
  autoApproved?: boolean;
  // The project's auto-approve KD line, so a pending row can say why it is
  // pending. Null = no domain-rating snapshot yet; the label just omits it.
  kdCeiling?: number | null;
}) {
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  // Local order wins for the whole session once the owner touches the list -
  // props (server order) only fill in rows we have never seen, so a server
  // refresh landing mid-session never snaps the list back.
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const saveSeq = useRef(0);

  const order = useMemo(() => {
    const propIds = rows.map((r) => r.id);
    if (!localOrder) return propIds;
    const known = new Set(localOrder);
    return [...localOrder.filter((id) => byId.has(id)), ...propIds.filter((id) => !known.has(id))];
  }, [rows, byId, localOrder]);

  // Rows removed this session vanish the instant Remove is clicked - the
  // server catches up on revalidate, and a failed write puts the row back
  // (QueueRemoveButton's callbacks drive both).
  const [gone, setGone] = useState<Set<string>>(new Set());
  const shown = order.filter((id) => !gone.has(id));

  // ---- drag state ----
  const [drag, setDrag] = useState<Drag | null>(null);
  const startYRef = useRef(0);
  const rectsRef = useRef<{ top: number; height: number }[]>([]);
  const rowRefs = useRef(new Map<string, HTMLDivElement | null>());

  // Commit a new order locally NOW, persist in the background. Never gate the
  // visual reorder on the round-trip.
  function commit(next: string[]) {
    setLocalOrder(next);
    const approvedIds = next.filter((id) => byId.get(id)?.status === "approved");
    const seq = ++saveSeq.current;
    startTransition(async () => {
      let failure: string | null = null;
      try {
        const r = await reorderQueue(kind, approvedIds);
        if (!r.ok) failure = r.message;
      } catch {
        failure = "Could not save the new order - it reverted.";
      }
      if (saveSeq.current !== seq) return; // a newer drop superseded this save
      if (failure) {
        setLocalOrder(null); // revert to the server's order
        setError(failure);
      } else {
        setError(null);
      }
    });
  }

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>, index: number) {
    if (drag) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    startYRef.current = e.clientY;
    rectsRef.current = shown.map((id) => {
      const rect = rowRefs.current.get(id)?.getBoundingClientRect();
      return { top: rect?.top ?? 0, height: rect?.height ?? 0 };
    });
    setDrag({ index, overIndex: index, dy: 0 });
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const rects = rectsRef.current;
    const me = rects[drag.index];
    const first = rects[0];
    const last = rects[rects.length - 1];
    // Keep the row inside the list while it travels.
    const dy = Math.max(
      first.top - me.top,
      Math.min(e.clientY - startYRef.current, last.top + last.height - (me.top + me.height)),
    );
    // Insertion index = how many other rows' midpoints sit above my center.
    const center = me.top + dy + me.height / 2;
    let overIndex = 0;
    rects.forEach((r, j) => {
      if (j !== drag.index && r.top + r.height / 2 < center) overIndex += 1;
    });
    setDrag({ index: drag.index, overIndex, dy });
  }

  function onPointerUp() {
    if (!drag) return;
    const { index, overIndex } = drag;
    setDrag(null);
    if (index !== overIndex) commit(arrayMove(shown, index, overIndex));
  }

  function onPointerCancel() {
    setDrag(null); // scroll/gesture stole the pointer - discard, don't commit
  }

  // Keyboard path: the grip is a button; arrows move the row one step.
  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const to = e.key === "ArrowUp" ? index - 1 : index + 1;
    if (to < 0 || to >= shown.length) return;
    commit(arrayMove(shown, index, to));
  }

  // Transforms while dragging: the grabbed row follows the pointer, rows it
  // has passed slide one slot the other way (they animate; the grabbed one
  // doesn't). Everything resets in the same render that reorders the list.
  function rowStyle(index: number): React.CSSProperties | undefined {
    if (!drag) return undefined;
    const h = rectsRef.current[drag.index]?.height ?? 0;
    if (index === drag.index) return { transform: `translateY(${drag.dy}px)` };
    if (drag.index < drag.overIndex && index > drag.index && index <= drag.overIndex)
      return { transform: `translateY(${-h}px)` };
    if (drag.index > drag.overIndex && index >= drag.overIndex && index < drag.index)
      return { transform: `translateY(${h}px)` };
    return undefined;
  }

  // Live position numbers: reflect where each row will land if dropped now.
  function livePosition(index: number): number {
    if (!drag) return index + 1;
    if (index === drag.index) return drag.overIndex + 1;
    if (drag.index < drag.overIndex && index > drag.index && index <= drag.overIndex) return index;
    if (drag.index > drag.overIndex && index >= drag.overIndex && index < drag.index) return index + 2;
    return index + 1;
  }

  const cell = "px-3 py-3";
  const template =
    kind === "guide"
      ? "[grid-template-columns:2rem_2.25rem_minmax(0,1fr)_auto_auto_auto_auto]"
      : "[grid-template-columns:2rem_minmax(0,1fr)_auto_auto_auto] sm:[grid-template-columns:2rem_minmax(0,1.6fr)_minmax(0,1fr)_auto_auto_auto]";

  return (
    <div>
      {/* Card fallback for <sm: the grid's seven fixed-width tracks (grip, #,
          keyword, vol, KD, status, actions) leave the keyword column ~70px
          wide, wrapping a real title to four lines - unlike a plain table,
          minmax(0,1fr) shrinks that track instead of the row scrolling. Cards
          render the same `shown` order; reordering itself stays sm+ only
          (drag needs pointer precision a touch card list can't give), but
          the order still displays correctly and Approve/Build now/Remove all
          still work. */}
      <CardList>
        {shown.map((id, index) => {
          const r = byId.get(id);
          if (!r) return null;
          const movable = r.status === "approved";
          return (
            <DataCard
              key={r.id}
              title={kind === "guide" ? (r.primary_keyword ?? r.title) : r.title}
              meta={kind === "guide" ? `#${index + 1} in the build queue` : r.primary_keyword}
              right={
                <StatusLabel
                  status={r.status}
                  autoApproved={autoApproved}
                  kd={r.keyword_difficulty}
                  kdCeiling={kdCeiling}
                />
              }
              stats={
                kind === "guide"
                  ? [
                      { label: "Volume", value: r.keyword_volume ?? "-" },
                      { label: "Difficulty", value: r.keyword_difficulty ?? "-" },
                    ]
                  : [
                      {
                        label: "Vol / KD",
                        value: `${r.keyword_volume ?? "-"}/${r.keyword_difficulty ?? "-"}`,
                      },
                    ]
              }
            >
              {/* A build already running can't be unpicked - mirrors the grid's actions cell. */}
              {r.status !== "in_progress" ? (
                <div className="mt-3 flex items-center justify-end gap-1.5">
                  {/* Reorder, touch edition. Drag needs pointer precision a
                      card list can't give, but the queue's ORDER is the whole
                      point of this screen - it decides what publishes next -
                      so mobile gets the same one-step moves the grip's arrow
                      keys already do, through the same commit(). */}
                  {movable && shown.length > 1 ? (
                    <span className="mr-auto flex items-center gap-1">
                      <MoveButton
                        dir="up"
                        disabled={index === 0}
                        onClick={() => commit(arrayMove(shown, index, index - 1))}
                      />
                      <MoveButton
                        dir="down"
                        disabled={index === shown.length - 1}
                        onClick={() => commit(arrayMove(shown, index, index + 1))}
                      />
                    </span>
                  ) : null}
                  {r.status === "pending" ? (
                    <QueueApproveButton id={r.id} auto={autoApproved} />
                  ) : null}
                  {kind === "tool" && movable ? <QueueBuildNowButton id={r.id} /> : null}
                  <QueueRemoveButton
                    id={r.id}
                    onRemoved={() => setGone((prev) => new Set(prev).add(r.id))}
                    onRestored={() =>
                      setGone((prev) => {
                        const next = new Set(prev);
                        next.delete(r.id);
                        return next;
                      })
                    }
                  />
                </div>
              ) : null}
            </DataCard>
          );
        })}
      </CardList>

      <div className="hidden overflow-x-auto rounded-xl bg-neutral-900 sm:block">
        <div className={`grid w-full text-left text-sm ${template} ${drag ? "select-none" : ""}`}>
          {/* micro-header, same voice as THead */}
          <div className="col-span-full grid grid-cols-subgrid text-xs font-medium text-neutral-500">
            <div aria-hidden="true" />
            {kind === "guide" ? (
              <>
                <div className={cell}>#</div>
                <div className={cell}>Keyword</div>
                <div className={cell}>Vol</div>
                <div className={cell}>KD</div>
              </>
            ) : (
              <>
                <div className={cell}>Idea</div>
                <div className={`hidden sm:block ${cell}`}>Keyword</div>
                <div className={cell}>Vol/KD</div>
              </>
            )}
            <div className={cell}>Status</div>
            <div className={`${cell} pr-4`}>
              <span className="sr-only">Actions</span>
            </div>
          </div>

          {shown.map((id, index) => {
            const r = byId.get(id);
            if (!r) return null;
            const movable = r.status === "approved";
            const isDragged = drag?.index === index;
            return (
              <div
                key={r.id}
                ref={(el) => {
                  rowRefs.current.set(r.id, el);
                }}
                style={rowStyle(index)}
                className={`relative col-span-full grid grid-cols-subgrid items-center border-t ${
                  isDragged
                    ? "z-10 border-transparent bg-neutral-800 shadow-lg shadow-black/40 ring-1 ring-neutral-700"
                    : drag
                      ? "border-neutral-800/70 transition-transform duration-200 ease-out motion-reduce:transition-none"
                      : "border-neutral-800/70 hover:bg-neutral-800/30"
                }`}
              >
                {/* grip - only queued (approved) rows can move */}
                <div className="flex justify-center">
                  {movable ? (
                    <button
                      type="button"
                      aria-label={`Reorder ${r.primary_keyword ?? r.title} - arrow keys move it up or down`}
                      onPointerDown={(e) => onPointerDown(e, index)}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerCancel={onPointerCancel}
                      onKeyDown={(e) => onKeyDown(e, index)}
                      className={`touch-none rounded p-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 ${
                        isDragged
                          ? "cursor-grabbing text-neutral-300"
                          : "cursor-grab text-neutral-600 hover:text-neutral-300"
                      }`}
                    >
                      <GripIcon />
                    </button>
                  ) : null}
                </div>

                {kind === "guide" ? (
                  <>
                    <div className={`${cell} tabular-nums text-neutral-300`}>{livePosition(index)}</div>
                    <div className={cell}>{r.primary_keyword ?? r.title}</div>
                    <div className={`${cell} tabular-nums`}>{r.keyword_volume ?? "-"}</div>
                    <div className={`${cell} tabular-nums`}>{r.keyword_difficulty ?? "-"}</div>
                  </>
                ) : (
                  <>
                    <div className={cell}>{r.title}</div>
                    <div className={`hidden text-neutral-300 sm:block ${cell}`}>{r.primary_keyword}</div>
                    <div className={`${cell} tabular-nums`}>
                      {r.keyword_volume ?? "-"}/{r.keyword_difficulty ?? "-"}
                    </div>
                  </>
                )}

                <div className={cell}>
                  <StatusLabel
                    status={r.status}
                    autoApproved={autoApproved}
                    kd={r.keyword_difficulty}
                    kdCeiling={kdCeiling}
                  />
                </div>

                {/* A build already running can't be unpicked or moved. */}
                <div className={`${cell} pr-4 text-right`}>
                  {r.status !== "in_progress" ? (
                    <span className="inline-flex items-center gap-1.5">
                      {r.status === "pending" ? <QueueApproveButton id={r.id} auto={autoApproved} /> : null}
                      {kind === "tool" && movable ? <QueueBuildNowButton id={r.id} /> : null}
                      <QueueRemoveButton
                        id={r.id}
                        onRemoved={() =>
                          setGone((prev) => new Set(prev).add(r.id))
                        }
                        onRestored={() =>
                          setGone((prev) => {
                            const next = new Set(prev);
                            next.delete(r.id);
                            return next;
                          })
                        }
                      />
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-amber-300">{error}</p> : null}
    </div>
  );
}
