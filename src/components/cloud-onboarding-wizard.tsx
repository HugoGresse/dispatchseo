"use client";

import { useEffect, useRef, useState, useTransition, type JSX, type ReactNode } from "react";
import { useActionState } from "react";
import { JOURNEY_STAGES, STAGE_META } from "@/lib/journey-meta";
import { FirstRunStatus } from "@/components/first-run-status";
import { agentById, builderAgents, type AgentId } from "@/lib/agents";
import { AgentMark } from "@/components/agent-mark";
import {
  chooseGithubRepo,
  connectClaudeToken,
  runPipelineInstall,
  setAgent,
  setProjectMode,
  setWizardScreen,
  wizardCreateProject,
  wizardSetGscProperty,
  type ChooseRepoState,
  type ConnectClaudeState,
  type WizardCreateState,
  type WizardGscPropertyState,
} from "@/app/actions";
import type { CloudWizardScreen } from "@/lib/wizard-screens";
import {
  CopyBox,
  ErrorLine,
  PrereqCallout,
  StepHelp,
  StepIcon,
  inputClass,
} from "@/components/wizard-ui";

// The cloud onboarding wizard - six screens (c0-c5) over a 5-step rail.
// Cloud drops everything self-host's wizard needs a terminal for: GitHub
// connects through the App (no token to paste), Claude Code needs one
// setup-token paste instead of a whole install command, and the pipeline
// installs itself server-side (runPipelineInstall) instead of the owner
// pasting an install command into their own Claude Code. Screen persistence
// (setWizardScreen) and the resume-on-reload pattern are copied verbatim
// from onboarding-wizard.tsx so the two wizards never drift on the basics.

const RAIL: Record<CloudWizardScreen, number> = {
  c0: 0,
  c1: 1,
  c2: 2,
  c3: 3,
  c4: 4,
  c5: 5,
};

const STEP_COUNT = 5;

const META: Record<Exclude<CloudWizardScreen, "c5">, { name: string; time: string }> = {
  c0: { name: "Add your site", time: "about 30 seconds" },
  c1: { name: "Connect GitHub", time: "about 1 minute" },
  c2: { name: "Connect your coding agent", time: "about 1 minute" },
  c3: { name: "Search Console", time: "about 2 minutes" },
  c4: { name: "Publish mode", time: "30 seconds" },
};

// The honest SEO timeline - same stage copy the Home journey card and
// get_overview use (journey-meta.ts is client-safe, unlike journey.ts).
const TIMELINE = JOURNEY_STAGES.map((k) => ({
  months: STAGE_META[k].months ?? "",
  label: STAGE_META[k].label,
  copy: STAGE_META[k].expectation,
}));

export type CloudWizardResume = {
  screen: CloudWizardScreen;
  created: { slug: string; name: string; domain: string } | null;
  githubRepo: string | null;
  installationId: number | null;
  installationRepos: string[] | null; // live repo list when installation exists but repo not chosen, else null
  gscConnected: boolean;
  gscSites: string[] | null; // live property list when connected, else null
  gscSiteUrl: string | null; // current tracked property
  mode: "semi" | "auto" | "custom";
  agent: AgentId; // which coding agent c2 is currently set to
};

type PipelineInstallResult = Awaited<ReturnType<typeof runPipelineInstall>>;

// The one-line "who pays" subtitle under each agent's name on the c2 picker.
// Wizard-specific copy, not a registry field - same reasoning and same text
// as onboarding-wizard.tsx's AGENT_PICKER_SUBTITLE, kept as a separate
// colocated map here rather than shared so the two wizards can each change
// independently. Adding a new agent means adding one entry here; the map is
// exhaustive over AgentId so a missing one is a compile error, not a
// silently absent subtitle.
const AGENT_PICKER_SUBTITLE: Record<AgentId, string> = {
  claude: "Needs a Claude subscription · builds cost nothing extra, they run on your plan",
  codex: "Needs an OpenAI API key · builds are metered by OpenAI per run",
  cursor: "Runs on your Cursor plan · builds use its API key, nothing extra is billed",
};

// c2's whole "get your credential" block - prerequisite callout plus the
// paragraph(s) under it. Not registry data: it's the screen's own explanation
// of how to obtain and paste the credential, and the agents' flows aren't
// even parallel in shape (Claude runs a terminal command first; Codex and
// Cursor mint a key on a web page with no CLI step at all), so this holds the
// entire fragment per agent rather than field-by-field pieces.
const AGENT_CREDENTIAL_INTRO: Record<AgentId, ReactNode> = {
  claude: (
    <>
      <PrereqCallout
        title="Never used Claude Code before?"
        body={
          <>
            Install it first - it takes about 2 minutes. Until you do, the command below
            prints <code className="font-mono text-neutral-300">command not found</code>.
          </>
        }
        href="/docs/install-claude-code"
        cta="Install Claude Code"
      />
      <p className="mb-2 mt-4 text-base font-medium text-neutral-200">
        Run this in a terminal and copy what it prints
      </p>
      <CopyBox text="claude setup-token" />
      <p className="mt-3 text-sm leading-relaxed text-neutral-400">
        Open a terminal on your computer — the macOS <b className="font-medium text-neutral-300">Terminal</b> app,
        or the terminal panel in VS Code — and run the command above. It opens a browser login, then prints a
        token starting with <code className="font-mono text-neutral-300">sk-ant-oat...</code>. Paste it below.
      </p>
    </>
  ),
  codex: (
    <>
      {/* No command to run: an OpenAI key is minted in a browser, so
          the Codex CLI is not a prerequisite for THIS screen at all.
          Saying so matters - telling someone to install a CLI they
          do not yet need is how a one-minute step becomes ten. */}
      <PrereqCallout
        title="You need an OpenAI API key"
        body={
          <>
            Create one at platform.openai.com - it takes about a minute, and the account
            needs credit on it before a build can run. You do not need the Codex CLI
            installed for this step.
          </>
        }
        href="https://platform.openai.com/api-keys"
        cta="Create an API key"
      />
      <p className="mt-4 text-sm leading-relaxed text-neutral-400">
        Copy the key — it starts with{" "}
        <code className="font-mono text-neutral-300">sk-...</code> and OpenAI only shows
        it once — and paste it below. We check it against OpenAI before storing it, so a
        half-copied key or an account with no credit is caught here rather than at 5am.
      </p>
    </>
  ),
  cursor: (
    <>
      {/* Like Codex, no CLI is a prerequisite for THIS screen: the key is
          minted on a web page. The direct URL leads because it is the one
          thing that stalls this step - the mint page is often missing from
          the dashboard's own navigation (measured 2026-08-05: a free
          account's nav showed no API-key tab, yet the URL minted a working
          key), so an owner browsing the menu would hunt for a page that
          seems not to exist. */}
      <PrereqCallout
        title="You need a Cursor API key"
        body={
          <>
            Create one at cursor.com/dashboard/api - open that link directly; the page
            is often not in the dashboard&apos;s own menu, but any plan can mint a key
            there. The overnight builds run where no browser exists, so the login on
            your own machine does not reach them; only a key does. You do not need the
            Cursor CLI installed for this step.
          </>
        }
        href="https://cursor.com/dashboard/api"
        cta="Open the API keys page"
      />
      <p className="mt-4 text-sm leading-relaxed text-neutral-400">
        Copy the key and paste it below. Watch for line-wrapping if you copy it from a
        terminal — the paste is checked for whitespace and for the other agents&apos;
        credentials before it is stored.
      </p>
    </>
  ),
};

// Whether the paste below is verified live or only shape-checked. Wizard
// prose about THIS screen's behavior, not the registry's `verifiedWith`
// field (that's a shorter noun phrase - "OpenAI" / "a shape check" - meant
// for other surfaces, not this sentence).
const AGENT_VERIFY_NOTE: Record<AgentId, string> = {
  claude:
    "Verification happens in the background after setup starts - this screen won't show an instant green check, and that's expected.",
  codex: "This is checked against OpenAI before it is stored, so it takes a second or two.",
  cursor:
    "This is shape-checked before it is stored - Cursor offers nothing to probe without a browser login, so the pipeline's token-check run does the real proving shortly after.",
};

function chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-4 w-4 shrink-0 text-neutral-500 transition-transform group-open:rotate-180"
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloudOnboardingWizard(props: {
  resume: CloudWizardResume | null;
  prefillDomain: string | null;
  ghFlag?: string | null;
  ghError?: string | null;
  gscFlag?: string | null;
}): JSX.Element {
  const { resume, prefillDomain, ghFlag, ghError, gscFlag } = props;

  const [screen, setScreenRaw] = useState<CloudWizardScreen>(() =>
    resume?.created && resume.screen === "c0" ? "c1" : resume?.screen ?? "c0",
  );
  function setScreen(next: CloudWizardScreen) {
    setScreenRaw(next);
    void setWizardScreen(next);
  }

  const [created, setCreated] = useState<{ slug: string; name: string; domain: string } | null>(
    resume?.created ?? null,
  );
  const [githubRepo, setGithubRepo] = useState<string | null>(resume?.githubRepo ?? null);
  const [gscSiteUrl, setGscSiteUrl] = useState<string | null>(resume?.gscSiteUrl ?? null);
  const [modeChoice, setModeChoice] = useState<"semi" | "auto">(
    resume?.mode === "auto" ? "auto" : "semi",
  );

  // These only ever change via a full navigation away and back (the GitHub
  // App install flow, the Google OAuth flow), which remounts this component
  // with a fresh `resume` - so they're read straight from props, not state.
  const installationId = resume?.installationId ?? null;
  const installationRepos = resume?.installationRepos ?? null;
  const gscConnected = resume?.gscConnected ?? false;
  const gscSites = resume?.gscSites ?? null;

  const step = RAIL[screen];

  // ---- c0: create the project ----------------------------------------------
  const [createState, createAction, createPending] = useActionState<WizardCreateState, FormData>(
    wizardCreateProject,
    null,
  );
  useEffect(() => {
    if (createState && "ok" in createState) {
      setCreated({ slug: createState.slug, name: createState.name, domain: createState.domain });
      setScreen("c1");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createState]);

  // ---- c1: GitHub App install + repo pick -----------------------------------
  const [repoState, repoAction, repoPending] = useActionState<ChooseRepoState, FormData>(
    chooseGithubRepo,
    null,
  );
  useEffect(() => {
    if (repoState && "ok" in repoState) {
      setGithubRepo(repoState.repo);
      setScreen("c2");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoState]);
  // Returning from the GitHub install redirect is a full page reload, so this
  // component remounts - but `screen` resumes from wherever it was PERSISTED
  // (c1, since that's where the owner left to go install the App), while
  // `resume.githubRepo` now reflects the pick made mid-flow. One mount-time
  // check bumps past the now-stale c1 without needing a second navigation.
  useEffect(() => {
    if (screen === "c1" && resume?.githubRepo) setScreen("c2");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- c2: the coding agent, then its credential -----------------------------
  // The choice is persisted the moment it is made rather than on submit: a
  // reload here is common (people go install the CLI mid-screen), and coming
  // back to Claude Code after picking Codex would send them to mint the wrong
  // credential. It is also what the builders read at run time, so writing it
  // late would leave a window where the repo secret and projects.agent disagree.
  const [agentChoice, setAgentChoice] = useState<AgentId>(resume?.agent ?? "claude");
  const agent = agentById(agentChoice);
  const [agentSaving, startAgentSave] = useTransition();
  function pickAgent(next: AgentId) {
    if (next === agentChoice) return;
    setAgentChoice(next);
    const slug = created?.slug;
    if (!slug) return;
    startAgentSave(async () => {
      // A failed write is not worth blocking the screen for - the paste below
      // sends its own `agent` field, so the credential still lands in the right
      // secret, and c5's install resolves the agent server-side from the same
      // form. Worst case the switch is re-applied on Settings.
      try {
        await setAgent(next, slug);
      } catch {
        /* non-fatal, see above */
      }
    });
  }

  const [claudeState, claudeAction, claudePending] = useActionState<ConnectClaudeState, FormData>(
    connectClaudeToken,
    null,
  );
  useEffect(() => {
    if (claudeState && "ok" in claudeState) setScreen("c3");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claudeState]);

  // ---- c3: Search Console property pick --------------------------------------
  const [gscPropState, gscPropAction] = useActionState<WizardGscPropertyState, FormData>(
    wizardSetGscProperty,
    null,
  );
  const gscError = gscFlag && gscFlag !== "connected" ? gscFlag : null;

  // ---- c4: publish mode -------------------------------------------------------
  const [pendingMode, startMode] = useTransition();
  // c4 was the one screen with no error surface, and it is the screen that
  // unlocks the product: setProjectMode THROWS (unknown project, DB error, or
  // an expired session via assertAuthed), and an unhandled throw inside the
  // transition meant setScreen("c5") never ran. So the onboarding_screen stamp
  // never landed, the gate kept bouncing every dashboard page back here, and
  // the only feedback was a Continue button that re-enabled with nothing said -
  // or the generic app-level "Something broke on this page", which names
  // neither the step nor the way out. The most likely trigger is the most
  // mundane one: leave the tab open long enough for the Supabase session to
  // lapse, come back, click Continue. Catch it and say so, like c0-c3 and c5
  // all already do.
  const [modeError, setModeError] = useState<string | null>(null);
  function confirmMode() {
    setModeError(null);
    startMode(async () => {
      try {
        await setProjectMode(modeChoice, created?.slug ?? "");
        setScreen("c5");
      } catch {
        setModeError(
          "Couldn't save that choice - your sign-in may have expired. Reload the page and try again.",
        );
      }
    });
  }

  // ---- c5: fire-and-poll the install ------------------------------------------
  const [installResult, setInstallResult] = useState<PipelineInstallResult | null>(null);
  const [installPending, startInstall] = useTransition();
  const installedOnce = useRef(false);
  function fireInstall() {
    // The wizard names the project it is installing into. Without a slug there
    // is nothing safe to do: the action used to fall back to "whatever project
    // is active", which is how a page load once aimed an install at a repo
    // nobody had selected. Say so instead of guessing.
    if (!created?.slug) {
      setInstallResult({ error: "Lost track of which site this is - reload and pick it again." });
      return;
    }
    const slug = created.slug;
    startInstall(async () => {
      setInstallResult(await runPipelineInstall(slug));
    });
  }
  useEffect(() => {
    // ONLY at the finale. Firing on any earlier screen calls runPipelineInstall
    // before a project exists, whose getActiveProject() redirects a fresh user
    // back to /onboarding - which remounts this wizard and re-fires the effect,
    // a ~0.3s redirect loop that stole focus from every field (2026-07-23).
    //
    // Leaving c5 ARMS the next arrival: the finale can now send someone back to
    // c2 to re-paste a Claude token, and a ref that latched true forever meant
    // returning to c5 silently did nothing - the one screen whose entire job is
    // to fire the install would just sit there. Re-entry is safe: the install
    // is idempotent by design (pipeline-install.ts), and an already-installed
    // project short-circuits in the action.
    if (screen !== "c5") {
      installedOnce.current = false;
      setInstallResult(null);
      return;
    }
    if (installedOnce.current) return;
    installedOnce.current = true;
    fireInstall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  function renderInstallBanner(): JSX.Element | null {
    if (!installResult) {
      return installPending ? (
        <p className="text-sm text-neutral-400">Installing your automation pipeline…</p>
      ) : null;
    }
    if ("error" in installResult) {
      return (
        <div className="space-y-3">
          <ErrorLine msg={installResult.error} />
          <button
            type="button"
            onClick={fireInstall}
            disabled={installPending}
            className="cursor-pointer rounded-lg bg-neutral-800 px-4 py-2 text-sm font-semibold text-neutral-200 transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {installPending ? "Retrying..." : "Retry"}
          </button>
        </div>
      );
    }
    if (installResult.mode === "pr") {
      return (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.07] p-3.5 text-sm text-amber-100/90">
          <b className="font-semibold text-amber-200">Your move:</b> your repo&apos;s branch
          protection requires a pull request - merge it, then come back to this page
          and hit Retry below. Setup starts from here, so it can&apos;t begin until the
          pipeline is on your default branch.
          {installResult.pr_url ? (
            <>
              {" "}
              <a
                href={installResult.pr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-300 underline underline-offset-2 hover:text-violet-200"
              >
                Open the pull request
              </a>
            </>
          ) : null}
          <div className="mt-3">
            <button
              type="button"
              onClick={fireInstall}
              disabled={installPending}
              className="cursor-pointer rounded-lg bg-neutral-800 px-4 py-2 text-sm font-semibold text-neutral-200 transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {installPending ? "Checking..." : "I merged it - continue"}
            </button>
          </div>
        </div>
      );
    }
    if (installResult.mode === "already-installed") {
      return (
        <p className="text-sm text-neutral-300">
          Setup is already complete for this site - nothing left to install. The checklist below
          shows where your first runs got to.
        </p>
      );
    }
    if (!installResult.setup_dispatched) {
      // Two very different states, and telling them apart is the whole point:
      // no token on the repo is a dead end that Retry cannot clear, so send the
      // owner back to the step that fixes it instead of asking them to wait.
      const noToken = !installResult.agent_token_present;
      return (
        <div className="space-y-3">
          {noToken ? (
            <p className="text-sm text-amber-100/90">
              <b className="font-semibold text-amber-200">
                Your {installResult.agent_name} credential didn&apos;t make it onto the repo.
              </b>{" "}
              Setup can&apos;t start without it, and waiting won&apos;t fix it - go back to the
              agent step and paste it again.
            </p>
          ) : (
            <p className="text-sm text-neutral-400">
              The pipeline is in your repo, but GitHub didn&apos;t accept the request to start the
              setup run. Retry below - if it keeps failing, check that Actions are enabled on your
              repository.
            </p>
          )}
          <div className="flex items-center gap-2.5">
            {noToken ? (
              <button
                type="button"
                onClick={() => setScreen("c2")}
                className="cursor-pointer rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400"
              >
                Back to the {installResult?.agent_name ?? "agent"} step
              </button>
            ) : null}
            <button
              type="button"
              onClick={fireInstall}
              disabled={installPending}
              className="cursor-pointer rounded-lg bg-neutral-800 px-4 py-2 text-sm font-semibold text-neutral-200 transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {installPending ? "Retrying..." : "Retry"}
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutral-300">
          Pipeline installed. Your agent is starting first research and personalizing the backlink
          playbook - the checklist below fills in as it works.
        </p>
        {installResult.actions_pr_permission === "manual-needed" && githubRepo ? (
          // The one thing the App can't do for the owner: it deliberately
          // lacks Administration permission, so this repo setting needs their
          // click. Until 2026-08-02 this flag was computed and then dropped -
          // the first real cloud user's install verified everything except
          // this toggle and nobody was ever told.
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.07] p-3.5 text-sm text-amber-100/90">
            <b className="font-semibold text-amber-200">One GitHub toggle needs your click:</b>{" "}
            open{" "}
            <a
              href={`https://github.com/${githubRepo}/settings/actions`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-300 underline underline-offset-2 hover:text-violet-200"
            >
              your repo&apos;s Actions settings
            </a>{" "}
            and enable{" "}
            <b className="font-medium text-amber-200">
              &quot;Allow GitHub Actions to create and approve pull requests&quot;
            </b>
            . Every content PR is opened from inside a workflow, so the final verification stays
            blocked until this is on. No need to come back here - it&apos;s re-checked
            automatically.
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* header */}
      <div className="flex items-center justify-between pb-4 pt-1">
        <p className="text-sm font-semibold tracking-tight">Set up your site</p>
        <p className="flex items-center gap-1.5 text-xs text-neutral-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" strokeLinecap="round" />
          </svg>
          ~5 minutes
        </p>
      </div>

      {/* progress rail */}
      <div className="flex gap-1.5" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`h-[3px] flex-1 rounded-full transition-colors ${
              step > i || screen === "c5"
                ? "bg-violet-500"
                : step === i
                  ? "bg-gradient-to-r from-violet-500 from-45% to-neutral-800 to-45%"
                  : "bg-neutral-800"
            }`}
          />
        ))}
      </div>
      <div className="mb-5 mt-2 flex items-baseline justify-between text-xs text-neutral-500">
        {screen === "c5" ? (
          <span className="font-medium text-neutral-100">Setup complete</span>
        ) : (
          <>
            <span className="text-neutral-400">
              Step {step + 1} of {STEP_COUNT} ·{" "}
              <b className="font-medium text-neutral-100">{META[screen].name}</b>
            </span>
            <span>{META[screen].time}</span>
          </>
        )}
      </div>

      {/* ============ c0 · Add your site ============ */}
      {screen === "c0" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              <path d="M2 12h20" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">Add your site</h2>
          <p className="mb-2.5 text-base text-neutral-400">
            The website you want Google traffic for. Takes 30 seconds - GitHub and your coding
            agent connect next.
          </p>
          {/* Same slot on all six screens - see StepHelp's note on why the
              position is uniform and why it opens in a new tab. */}
          <StepHelp
            href="/docs/setup-wizard#on-dispatchseo-com-the-hosted-version"
            label="What goes in these fields?"
          />
          <form action={createAction} className="space-y-3 rounded-xl bg-neutral-900 p-4">
            {createState && "error" in createState ? <ErrorLine msg={createState.error} /> : null}
            <label className="block space-y-1.5">
              <span className="text-base font-medium text-neutral-200">Site name</span>
              <input name="name" required placeholder="My site" autoComplete="off" className={inputClass} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-base font-medium text-neutral-200">Your site&apos;s domain</span>
              <input
                name="domain"
                required
                placeholder="yoursite.com"
                autoComplete="off"
                defaultValue={prefillDomain ?? undefined}
                className={inputClass}
              />
              <span className="block text-sm leading-relaxed text-neutral-500">
                The website whose rankings DispatchSEO will grow and track.
              </span>
            </label>
            {/* Cloud detects the repo's content layout during setup instead of
                asking here - the blog-location question doesn't exist yet
                because there's no repo to inspect until step 2. */}
            <input type="hidden" name="content_mode" value="detect" />
            <input type="hidden" name="mode" value="semi" />
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={createPending}
                className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {createPending ? "Creating..." : "Continue"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {/* ============ c1 · Connect GitHub ============ */}
      {screen === "c1" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <circle cx="7" cy="12" r="3" />
              <circle cx="17" cy="12" r="3" />
              <path d="M10 12h4" strokeLinecap="round" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">Connect GitHub</h2>
          <p className="mb-2.5 text-base text-neutral-400">
            DispatchSEO installs its pipeline into your repo and opens (and merges) pull requests
            through the DispatchSEO GitHub App - no tokens to paste.
          </p>
          <StepHelp
            href="/docs/setup-wizard#on-dispatchseo-com-the-hosted-version"
            label="What does the GitHub App do?"
          />
          {ghFlag === "error" ? (
            <div className="mb-3.5">
              <ErrorLine
                msg={ghError ? `GitHub connection failed: ${ghError}` : "GitHub connection failed. Try again."}
              />
            </div>
          ) : null}
          <div className="rounded-xl bg-neutral-900 p-4">
            {githubRepo ? (
              <p className="text-sm text-neutral-400">GitHub is connected. Continuing…</p>
            ) : installationId && installationRepos && installationRepos.length > 0 ? (
              <form action={repoAction} className="space-y-2.5">
                {repoState && "error" in repoState ? <ErrorLine msg={repoState.error} /> : null}
                {/* Which site this repo is being bound to. Everything the
                    pipeline later writes follows from this pairing, so it must
                    not be inferred from the active-project cookie. */}
                <input type="hidden" name="slug" value={created?.slug ?? ""} />
                <p className="text-base font-medium text-neutral-200">
                  Pick the repo DispatchSEO should publish into
                </p>
                <div className="space-y-1.5">
                  {installationRepos.map((r, i) => (
                    <label
                      key={r}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-neutral-700 px-3 py-2.5 text-sm text-neutral-200 transition-colors hover:border-neutral-500 has-[:checked]:border-violet-500 has-[:checked]:bg-[#191521]"
                    >
                      <input
                        type="radio"
                        name="repo"
                        value={r}
                        defaultChecked={i === 0}
                        className="h-4 w-4 accent-violet-500"
                      />
                      {r}
                    </label>
                  ))}
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={repoPending}
                    className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {repoPending ? "Saving..." : "Continue"}
                  </button>
                </div>
              </form>
            ) : installationId ? (
              // The App is installed but we have no repo to offer. Two ways in,
              // and the form used to render for both with ZERO radio options: a
              // Continue button whose only possible answer was "Pick a
              // repository." and no install link (that lives in the branch
              // below, which an installationId makes unreachable). Onboarding
              // simply could not proceed.
              //   (a) listInstallationRepos threw - it has a 10s timeout and
              //       throws on any non-2xx, and /onboarding swallows that to
              //       null. A reload genuinely fixes this, but nothing on screen
              //       ever said so.
              //   (b) the installation really has no repos we can see (the repo
              //       left the installation between installing and landing back
              //       here - the install callback sends ?gh=pick_repo for 0 repos
              //       exactly as it does for 2+). A reload never fixes that one;
              //       only re-picking the shared repos on GitHub does.
              // We can't tell (a) from (b) here, so offer both exits.
              <>
                <p className="mb-3.5 text-[15px] leading-relaxed text-neutral-400">
                  The GitHub App is installed, but we couldn&apos;t get a list of repos back
                  from GitHub. That&apos;s usually a hiccup on the way here - reload and it
                  should appear. If it keeps happening, the App may not have any repo
                  shared with it yet.
                </p>
                <div className="flex flex-wrap items-center gap-2.5">
                  <a
                    href="/onboarding"
                    className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400"
                  >
                    Reload
                  </a>
                  <a
                    href={
                      created
                        ? `/api/github/install/start?slug=${encodeURIComponent(created.slug)}`
                        : "#"
                    }
                    className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-neutral-800 px-5 py-2 text-sm font-semibold text-neutral-200 transition-colors hover:bg-neutral-700"
                  >
                    Choose which repos to share
                  </a>
                </div>
              </>
            ) : (
              <>
                <p className="mb-3.5 text-[15px] leading-relaxed text-neutral-400">
                  One click, on GitHub&apos;s own install screen - pick the repo(s) to share and
                  come straight back here.
                </p>
                <a
                  href={created ? `/api/github/install/start?slug=${encodeURIComponent(created.slug)}` : "#"}
                  className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400"
                >
                  Install the DispatchSEO GitHub App
                </a>
              </>
            )}
          </div>
        </section>
      ) : null}

      {/* ============ c2 · Connect the coding agent ============ */}
      {screen === "c2" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <polyline points="4 17 10 11 4 5" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="19" x2="20" y2="19" strokeLinecap="round" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">Connect your coding agent</h2>
          <p className="mb-2.5 text-base text-neutral-400">
            Your agent does the research and writing. {agent.cost.note}
          </p>
          <StepHelp
            href={agent.installDocsPath}
            label={`I don't have ${agent.displayName} yet`}
          />
          <div className="rounded-xl bg-neutral-900 p-4">
            {/* The picker sits above everything else on this screen, because
                every line below it - the prerequisite, the command, the
                placeholder, the failure text - is different per agent. Claude
                Code stays the default: it is the more-tested path and the
                cheaper story, and Codex is one click rather than one scroll. */}
            <div className="mb-4">
              <p className="mb-1 text-base font-medium text-neutral-200">
                Which coding agent will do the work?
              </p>
              <p className="mb-2.5 text-sm leading-relaxed text-neutral-400">
                Both do the same job here - research, writing, pull requests. The difference is who
                bills you.
              </p>
              {/* builderAgents(), not a hardcoded pair - see the same picker
                  in onboarding-wizard.tsx for why it has to be right in both
                  directions. */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {builderAgents().map(({ id }) => (
                  <label
                    key={id}
                    className="flex cursor-pointer flex-col gap-1 rounded-lg border border-neutral-700 p-3.5 transition-colors hover:border-neutral-500 has-[:checked]:border-violet-500 has-[:checked]:bg-[#191521]"
                  >
                    <span className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name="agent-pick"
                        value={id}
                        checked={agentChoice === id}
                        onChange={() => pickAgent(id)}
                        disabled={agentSaving}
                        className="h-4 w-4 accent-violet-500"
                      />
                      <AgentMark id={id} className="h-[18px] w-[18px] shrink-0" />
                      <span className="text-sm font-semibold text-neutral-100">
                        {agentById(id).displayName}
                      </span>
                    </span>
                    <span className="pl-6 text-[13px] leading-relaxed text-neutral-400">
                      {AGENT_PICKER_SUBTITLE[id]}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* The prerequisite goes ABOVE the command, not below it: with no
                Claude Code installed the command prints "command not found",
                and a beginner reads that as a broken product rather than a
                missing tool. This screen is where the funnel used to end. */}
            {AGENT_CREDENTIAL_INTRO[agentChoice]}
            <form action={claudeAction} className="mt-3.5 space-y-2.5">
              {claudeState && "error" in claudeState ? <ErrorLine msg={claudeState.error} /> : null}
              {/* Name the target project: this writes the pasted token into a
                  repo as an Actions secret, and resolving "which repo" from the
                  active-project cookie can silently land on the wrong one. */}
              <input type="hidden" name="slug" value={created?.slug ?? ""} />
              {/* And name the agent, so the credential lands in the secret that
                  agent's workflows read. Sent explicitly rather than resolved
                  from projects.agent, because the write above is fire-and-forget
                  and may not have landed when this submits. */}
              <input type="hidden" name="agent" value={agentChoice} />
              <input
                name="token"
                type="password"
                placeholder={agent.credential.placeholder}
                autoComplete="new-password"
                className={inputClass}
              />
              {/* Only true for Claude Code. There is no Claude session on this
                  server to verify an OAuth token against, so that one is shape-
                  checked here and proven for real by seo-token-check minutes
                  later. An OpenAI key IS checked live before it is stored, and
                  saying otherwise would train people to ignore this screen. */}
              <p className="text-sm text-neutral-500">{AGENT_VERIFY_NOTE[agentChoice]}</p>
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={claudePending}
                  className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {claudePending ? "Saving..." : "Continue"}
                </button>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      {/* ============ c3 · Search Console ============ */}
      {screen === "c3" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <path d="M3 3v17a1 1 0 0 0 1 1h17" />
              <path d="M7 14l4-4 4 3 5-6" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">Connect Google Search Console</h2>
          <p className="mb-2.5 text-base text-neutral-400">
            This is where your traffic and ranking data comes from. One click, no key files to
            manage.
          </p>
          <StepHelp href="/docs/search-console" label="Walk me through Search Console" />
          {gscError ? (
            <div className="mb-3.5">
              <ErrorLine msg={gscError} />
            </div>
          ) : null}
          <div className="rounded-xl bg-neutral-900 p-4">
            {gscConnected ? (
              <>
                <p className="text-sm text-emerald-300">
                  Search Console is connected - data starts flowing today.
                </p>
                {gscSites && gscSites.length > 0 ? (
                  <div className="mt-3.5">
                    <p className="mb-2 text-base font-medium text-neutral-200">Which property is this?</p>
                    <form action={gscPropAction} className="space-y-1.5">
                      <input type="hidden" name="slug" value={created?.slug ?? ""} />
                      {gscPropState && "error" in gscPropState ? <ErrorLine msg={gscPropState.error} /> : null}
                      {gscSites.map((s) => (
                        <label
                          key={s}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-neutral-700 px-3 py-2.5 text-sm text-neutral-200 transition-colors hover:border-neutral-500 has-[:checked]:border-violet-500 has-[:checked]:bg-[#191521]"
                        >
                          <input
                            type="radio"
                            name="site_url"
                            value={s}
                            checked={gscSiteUrl === s}
                            onChange={(e) => {
                              setGscSiteUrl(s);
                              e.currentTarget.form?.requestSubmit();
                            }}
                            className="h-4 w-4 accent-violet-500"
                          />
                          {s}
                        </label>
                      ))}
                    </form>
                    {/* Only properties already verified in this Google account
                        show up (we ask for read-only access). If theirs is
                        missing, the fix is in Search Console, not here. */}
                    <p className="mt-3 text-[13px] leading-relaxed text-neutral-500">
                      Don&apos;t see your site? We only list properties already in{" "}
                      <a
                        href="https://search.google.com/search-console"
                        target="_blank"
                        rel="noreferrer"
                        className="text-neutral-300 underline underline-offset-2 hover:text-neutral-100"
                      >
                        Search Console
                      </a>
                      . Add and verify it there, or{" "}
                      <a
                        href="/api/oauth/google/start?returnTo=onboarding"
                        className="text-neutral-300 underline underline-offset-2 hover:text-neutral-100"
                      >
                        reconnect
                      </a>{" "}
                      with the Google account that manages it.
                    </p>
                  </div>
                ) : (
                  <p className="mt-3.5 text-[13px] leading-relaxed text-neutral-500">
                    We don&apos;t see any Search Console properties on this Google account. Your site
                    has to be added and verified in{" "}
                    <a
                      href="https://search.google.com/search-console"
                      target="_blank"
                      rel="noreferrer"
                      className="text-neutral-300 underline underline-offset-2 hover:text-neutral-100"
                    >
                      Search Console
                    </a>{" "}
                    first (read-only access is all we ask for). Once it&apos;s verified,{" "}
                    <a
                      href="/api/oauth/google/start?returnTo=onboarding"
                      className="text-neutral-300 underline underline-offset-2 hover:text-neutral-100"
                    >
                      reconnect
                    </a>{" "}
                    - or use the account that manages the site. You can also skip this and connect it
                    later.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="mb-3.5 text-[15px] leading-relaxed text-neutral-400">
                  Sign in with the Google account that manages this site in Search Console.
                </p>
                <a
                  href="/api/oauth/google/start?returnTo=onboarding"
                  className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400"
                >
                  Connect Google
                </a>
              </>
            )}
          </div>
          <div className="mt-5 flex items-center justify-end">
            {gscConnected ? (
              <button
                type="button"
                onClick={() => setScreen("c4")}
                className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setScreen("c4")}
                className="cursor-pointer text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
              >
                Skip - connect later
              </button>
            )}
          </div>
        </section>
      ) : null}

      {/* ============ c4 · Publish mode ============ */}
      {screen === "c4" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <path d="M12 22a10 10 0 1 0-10-10" strokeLinecap="round" />
              <path d="M2 17v5h5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">Should anything go live without you?</h2>
          <p className="mb-2.5 text-base text-neutral-400">
            Both modes research and build the same way. The only difference is whether a human
            says yes before something is published.
          </p>
          <StepHelp href="/docs/setup-wizard#step-5-publish-mode" label="Explain the two modes" />
          <div className="grid gap-3.5 sm:grid-cols-2">
            <button
              type="button"
              aria-pressed={modeChoice === "semi"}
              onClick={() => setModeChoice("semi")}
              className={`cursor-pointer rounded-xl border p-4 text-left transition-colors ${
                modeChoice === "semi"
                  ? "border-violet-500 bg-[#191521]"
                  : "border-neutral-800 bg-neutral-900 hover:border-neutral-600"
              }`}
            >
              <div className="mb-2.5 flex gap-1.5">
                <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-violet-400">
                  Recommended to start
                </span>
              </div>
              <h3 className="text-[15px] font-semibold">Semi-automatic</h3>
              <p className="mt-1 text-sm text-neutral-400">
                Claude researches and builds on its own, but nothing goes live without you. You
                approve ideas and merge finished pull requests right from the dashboard.
              </p>
              <p className="mt-2 text-sm text-neutral-400">A few minutes of your attention a week.</p>
            </button>
            <button
              type="button"
              aria-pressed={modeChoice === "auto"}
              onClick={() => setModeChoice("auto")}
              className={`cursor-pointer rounded-xl border p-4 text-left transition-colors ${
                modeChoice === "auto"
                  ? "border-violet-500 bg-[#191521]"
                  : "border-neutral-800 bg-neutral-900 hover:border-neutral-600"
              }`}
            >
              <div className="mb-2.5 flex gap-1.5">
                <span className="rounded bg-emerald-400/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                  Hands-off
                </span>
              </div>
              <h3 className="text-[15px] font-semibold">Automatic</h3>
              <p className="mt-1 text-sm text-neutral-400">
                Everything runs itself. Ideas are approved for you, and every page that passes its
                checks merges and goes live without anyone touching it.
              </p>
              <p className="mt-2 text-sm text-neutral-400">
                You can watch everything, and undo anything, from the dashboard.
              </p>
            </button>
          </div>
          <p className="mt-2.5 text-center text-sm text-neutral-400">
            Switch anytime with the Semi / Auto toggle in the top bar.
          </p>
          {modeChoice === "auto" ? (
            <p className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-neutral-300">
              In automatic mode nobody opens the dashboard on a normal day — so if a job ever breaks,
              <b className="font-medium text-neutral-100"> we email you</b> at your account address
              automatically. Nothing to set up; it&apos;s part of your plan.
            </p>
          ) : null}
          {modeError ? (
            <div className="mt-4">
              <ErrorLine msg={modeError} />
            </div>
          ) : null}
          <div className="mt-5 flex items-center justify-end">
            <button
              type="button"
              onClick={confirmMode}
              disabled={pendingMode}
              className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pendingMode ? "Saving..." : "Continue"}
            </button>
          </div>
        </section>
      ) : null}

      {/* ============ c5 · Finish ============ */}
      {screen === "c5" ? (
        <section>
          <StepIcon done>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" strokeLinecap="round" />
              <polyline points="22 4 12 14.01 9 11.01" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">You&apos;re live.</h2>
          <p className="mb-2.5 text-base text-neutral-400">
            Installing the pipeline into {created?.name ?? "your"}&apos;s repo now - no more
            pastes needed. This runs on GitHub and usually takes{" "}
            <b className="font-medium text-neutral-200">5-15 minutes</b>. You can leave this page
            and come back - setup finishes on its own, and your dashboard fills in as the
            data lands.
          </p>
          <StepHelp href="/docs/day-to-day" label="What happens next?" />

          <div className="rounded-xl bg-neutral-900 p-4">{renderInstallBanner()}</div>

          {/* The dashboard unlocks at this finale - the gate keys on the c5
              stamp, which runPipelineInstall wrote server-side when it fired
              just above - so don't trap the owner on this page: the background
              run keeps going and the dashboard shows its own "setting up"
              banner. Earlier screens stay locked on purpose; abandoning the
              wizard mid-flow bounces back here, not to a dashboard of zeros. */}
          <div className="mt-4 flex justify-center">
            <a
              href="/dashboard"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-neutral-100 transition-colors hover:border-violet-500/50 hover:bg-neutral-800"
            >
              Explore your dashboard while this finishes →
            </a>
          </div>

          <p className="mt-4 rounded-lg bg-neutral-900 px-3.5 py-3 text-sm text-neutral-400">
            Keyword data: included in your plan - nothing to set up.
          </p>

          <details className="group mt-4 rounded-xl bg-neutral-900 px-4 py-3">
            <summary className="flex cursor-pointer select-none items-center justify-between text-sm font-medium text-neutral-400 transition-colors hover:text-neutral-200">
              What to expect next
              {chevron()}
            </summary>
            <div className="mt-1">
              {TIMELINE.map((t) => (
                <div key={t.label} className="flex gap-3 border-b border-neutral-800 py-2.5 last:border-b-0">
                  <span className="w-20 shrink-0 pt-0.5 text-[11px] font-semibold uppercase tracking-wider text-violet-400">
                    {t.months}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-neutral-200">{t.label}</p>
                    <p className="text-sm text-neutral-400">{t.copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </details>

          {created ? <FirstRunStatus slug={created.slug} cloud /> : null}
        </section>
      ) : null}
    </div>
  );
}
