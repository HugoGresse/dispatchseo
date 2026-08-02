"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addAgentKey, getAgentCredentialStatuses, setAgent } from "@/app/actions";
import type { AgentCredentialStatus } from "@/lib/agent-settings";
import { availableAgents, agentById, type AgentDefinition } from "@/lib/agents";
import { AgentMark } from "@/components/agent-mark";

// Topbar agent switcher, left of the Semi/Auto pill: the current agent's mark,
// and a dropdown of the agents this project has ADDED - the one in use plus
// any whose credential already exists where the project builds. Agents the
// owner never set up are not listed as peers; they live behind an explicit
// "Add agent" button that opens a picker, then a paste-the-key form. Only a
// verified, stored key adds an agent to the list - so seeing Codex there
// never reads as "you're expected to use Codex". (status "unknown" - can't
// check, e.g. write-only repo secrets - counts as added: the key may well
// exist, and hiding a working agent behind an add-a-key flow would demand a
// credential the owner already has.)
//
// Same honesty rule as the Settings switch (agent-switch.tsx): this decides
// who runs the UNATTENDED builds. Whatever agent the owner connects over MCP
// drives everything interactively regardless, and the dropdown's footer says
// so rather than letting the topbar imply an agent is locked out.
//
// Credential presence is fetched when the dropdown opens, never during layout
// render: the cloud check asks the GitHub API once per agent, and this
// component mounts on every dashboard page. The layout keys this component by
// project slug, so no state survives a project switch.
export function AgentHeaderSwitch({ current, slug }: { current: string; slug: string }) {
  const agents = availableAgents();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, AgentCredentialStatus> | null>(null);
  // Monotonic fetch counter: reopening the dropdown refires the status fetch,
  // and an older, slower response must not land on top of a newer one.
  const statusFetch = useRef(0);
  // Panel state: the agent list, the add-an-agent picker, or the key form.
  const [view, setView] = useState<"list" | "pick">("list");
  const [keyFor, setKeyFor] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState("");
  const [pending, start] = useTransition();
  // Optimistic: the mark flips the instant a switch is chosen, cleared when the
  // server prop catches up, rolled back with an error line if the write fails.
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The switch landed but the new agent's key can't be confirmed from here
  // (write-only repo secrets) - link the box instead of staying silent.
  const [keyReminder, setKeyReminder] = useState<string | null>(null);
  useEffect(() => {
    setOptimistic(null);
  }, [current]);
  const shown = agentById(optimistic ?? current);

  function close() {
    setOpen(false);
    setView("list");
    setKeyFor(null);
    setKeyValue("");
    setError(null);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function fetchStatuses() {
    const seq = ++statusFetch.current;
    getAgentCredentialStatuses(slug)
      .then((s) => {
        if (seq === statusFetch.current) setStatuses(s);
      })
      .catch(() => {
        if (seq === statusFetch.current) setStatuses(null);
      });
  }

  function toggle() {
    if (open) {
      close();
      return;
    }
    setOpen(true);
    setView("list");
    setKeyFor(null);
    setKeyValue("");
    setError(null);
    // The post-switch key reminder has done its job once the dropdown is
    // reopened - and this component lives in the layout, so nothing else
    // ever unmounts it. Without this, the reminder lingers across every
    // navigation and sits underneath the reopened panel.
    setKeyReminder(null);
    // Refetched on every open, not cached: a key pasted on Settings in
    // another tab has to show up here without a full reload.
    fetchStatuses();
  }

  function choose(id: string) {
    if (pending) return;
    if (id === shown.id) {
      close();
      return;
    }
    setOptimistic(id); // flip the mark now
    setKeyReminder(null);
    close();
    start(async () => {
      try {
        const res = await setAgent(id, slug);
        if (res.needsCredential) setKeyReminder(id);
        router.refresh();
      } catch (e) {
        setOptimistic(null); // roll back to the real agent
        setError(e instanceof Error ? e.message : "Could not switch agent.");
      }
    });
  }

  function submitKey() {
    if (pending || !keyFor) return;
    const id = keyFor;
    setError(null);
    start(async () => {
      const res = await addAgentKey(id, keyValue, slug);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      // Key verified + stored: the agent is now "added". Deliberately NOT
      // switched - adding an option and choosing it are different acts, and
      // the whole point of the add flow is not pushing anyone onto an agent.
      // Back to the list, where the new agent now shows with a Switch action.
      setKeyFor(null);
      setKeyValue("");
      setView("list");
      setStatuses(null); // show the loading row while the refetch confirms
      fetchStatuses();
      router.refresh();
    });
  }

  // Added = in use, verifiably keyed, or unverifiable (see header comment).
  // While statuses are still loading, only the current agent is certain.
  const added = agents.filter(
    (a) => a.id === shown.id || (statuses != null && statuses[a.id] !== "needs-key"),
  );
  // Addable = verifiably missing its key. "unknown" is deliberately NOT
  // addable - it is already listed above.
  const addable = agents.filter((a) => a.id !== shown.id && statuses?.[a.id] === "needs-key");
  const formAgent = keyFor ? agentById(keyFor) : null;

  const agentRow = (a: AgentDefinition, right: React.ReactNode, onClick: () => void) => (
    <button
      key={a.id}
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={pending}
      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors disabled:opacity-60 ${
        a.id === shown.id ? "bg-neutral-800/70" : "hover:bg-neutral-800/50"
      }`}
    >
      <AgentMark id={a.id} className="h-[18px] w-[18px] shrink-0" />
      <span className="min-w-0 flex-1 truncate font-medium text-neutral-100">{a.displayName}</span>
      {right}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Scheduled builds run ${shown.displayName} - click to switch agents`}
        className="flex cursor-pointer items-center gap-1 rounded-full border border-neutral-800 bg-neutral-900/80 py-1 pl-2 pr-1.5 text-neutral-400 transition-colors hover:border-neutral-700 hover:text-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
      >
        <AgentMark id={shown.id} className="h-4 w-4 shrink-0" />
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="sr-only">Coding agent: {shown.displayName}</span>
      </button>

      {open && view === "list" && !formAgent && (
        <div
          role="menu"
          aria-label="Coding agent"
          // Centered under the button, not right-anchored like ModeSwitch's
          // popover: this button sits mid-header on mobile, where right-0
          // pushed the panel past the left screen edge. Centering fits every
          // breakpoint - the narrowest case (320px) still leaves margin.
          className="absolute left-1/2 top-full z-30 mt-2 w-64 -translate-x-1/2 rounded-xl border border-neutral-800 bg-neutral-900 p-1.5 shadow-xl shadow-black/40"
        >
          {added.map((a) =>
            agentRow(
              a,
              a.id === shown.id ? (
                <span className="shrink-0 text-xs font-medium text-violet-300">in use</span>
              ) : (
                <span className="shrink-0 text-xs text-neutral-500">Switch</span>
              ),
              () => choose(a.id),
            ),
          )}
          {statuses == null ? (
            <p className="px-2.5 py-1.5 text-xs text-neutral-600">Checking your agents...</p>
          ) : null}
          {addable.length > 0 ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setView("pick");
                setError(null);
              }}
              className="mt-0.5 flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-neutral-400 transition-colors hover:bg-neutral-800/50 hover:text-neutral-200"
            >
              <span
                aria-hidden
                className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-dashed border-neutral-600 text-[13px] leading-none"
              >
                +
              </span>
              Add agent
            </button>
          ) : null}
          {error ? <p className="px-2.5 pb-1 pt-1.5 text-xs text-red-400">{error}</p> : null}
          <p className="border-t border-neutral-800/70 px-2.5 pb-1 pt-2 text-[11px] leading-relaxed text-neutral-500">
            Which agent runs your scheduled builds - takes effect on the next run. Whichever
            agent you connect over MCP still drives everything by hand.
          </p>
        </div>
      )}

      {open && view === "pick" && !formAgent && (
        <div
          role="dialog"
          aria-label="Add an agent"
          className="absolute left-1/2 top-full z-30 mt-2 w-64 -translate-x-1/2 rounded-xl border border-neutral-800 bg-neutral-900 p-1.5 shadow-xl shadow-black/40"
        >
          <p className="px-2.5 pb-1.5 pt-1 text-sm font-medium text-white">Add an agent</p>
          {addable.map((a) =>
            agentRow(
              a,
              <span className="shrink-0 text-xs text-neutral-500">Needs key</span>,
              () => {
                setKeyFor(a.id);
                setError(null);
              },
            ),
          )}
          <div className="mt-0.5 flex justify-end border-t border-neutral-800/70 px-1 pb-0.5 pt-1.5">
            <button
              type="button"
              onClick={() => setView("list")}
              className="cursor-pointer rounded-md px-2.5 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {open && formAgent && (
        <div
          role="dialog"
          aria-label={`Add your ${formAgent.displayName} key`}
          className="absolute left-1/2 top-full z-30 mt-2 w-72 -translate-x-1/2 rounded-xl border border-neutral-800 bg-neutral-900 p-3.5 shadow-xl shadow-black/40"
        >
          <div className="flex items-center gap-2">
            <AgentMark id={formAgent.id} className="h-[18px] w-[18px] shrink-0" />
            <p className="text-sm font-medium text-white">Add {formAgent.displayName}</p>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">
            {formAgent.credential.howToMint}{" "}
            <a
              href={formAgent.credential.mintUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-violet-400 underline underline-offset-2 hover:text-violet-300"
            >
              {formAgent.credential.mintLinkLabel}
            </a>
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitKey();
            }}
            className="mt-2.5 space-y-2"
          >
            <input
              type="password"
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              placeholder={formAgent.credential.placeholder}
              autoComplete="off"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 font-mono text-xs text-neutral-100 placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-400/60"
            />
            {error ? <p className="text-xs leading-relaxed text-red-400">{error}</p> : null}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setKeyFor(null);
                  setError(null);
                }}
                className="cursor-pointer rounded-md px-2.5 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={pending || !keyValue.trim()}
                className="cursor-pointer rounded-md bg-violet-500 px-3 py-1.5 text-xs font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending ? "Verifying..." : "Add agent"}
              </button>
            </div>
          </form>
          {/* The key is checked against the provider before anything stores it,
              so a mangled paste fails here instead of on tomorrow's build.
              Adding does NOT switch - the agent joins the list, that's all. */}
          <p className="mt-2 border-t border-neutral-800/70 pt-2 text-[11px] leading-relaxed text-neutral-500">
            Verified with {formAgent.id === "codex" ? "OpenAI" : "a shape check"} before
            it&apos;s stored. Adding doesn&apos;t switch anything - you pick when to switch.
          </p>
        </div>
      )}

      {error && !open ? (
        <p className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[11px] text-red-400">
          Couldn&apos;t switch - try again
        </p>
      ) : null}
      {keyReminder && !open ? (
        <p className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[11px] text-amber-300">
          Switched -{" "}
          <a
            href={`/settings?credential=${keyReminder}#agent-credential`}
            className="underline underline-offset-2 hover:text-amber-200"
          >
            set the {agentById(keyReminder).displayName} key
          </a>{" "}
          so builds run
        </p>
      ) : null}
    </div>
  );
}
