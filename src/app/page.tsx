import type { Metadata } from "next";
import { DM_Sans, Plus_Jakarta_Sans } from "next/font/google";
import { redirect } from "next/navigation";
import { DispatchMark } from "@/components/logo";
import { DISCORD_URL, DiscordMark } from "@/components/discord-mark";
import { FeatureShowcase } from "./feature-showcase";
import { DemoVideo } from "./demo-video";
import { DomainCta } from "./domain-cta";
import { LandingNav } from "./landing-nav";
import { PixelDispatcher } from "@/components/pixel-dispatcher";
import { WhyCard } from "@/components/why-card";
import { dashboardAuth, maybeSignedIn } from "@/lib/auth-gate";
import { hasConfiguredProject } from "@/lib/onboarding-gate";
import {
  foundingOffer,
  foundingPriceLabel,
  listPriceLabel,
  type FoundingOffer,
} from "@/lib/founding";
import type { Tier } from "@/lib/billing";
import "./landing.css";

// Public landing page - cloud deployment only. Self-hosted installs never set
// LANDING_ENABLED, so their / goes straight to the dashboard (whose missing
// cookie bounces them to /login): a self-hosted instance is a private back
// office, not a brochure for our cloud. Design source: docs/landing-mockup.html.

// Per-request rendering: the LANDING_ENABLED check and the ?joined/?error
// form states must be evaluated at runtime, not baked in at build.
export const dynamic = "force-dynamic";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm" });

const GITHUB_URL = "https://github.com/NeoZi12/dispatchseo";
const DOCS_URL = "/docs";

export const metadata: Metadata = {
  title: "DispatchSEO - Automate your SEO with AI agents",
  description:
    "Claude Code or Codex researches keywords, writes guides, builds interactive tools, and tracks your ranks automatically. Every piece is a pull request you approve. Open source, free to self-host.",
  // "/" is reachable as itself and as "?home=1" (the signed-in opt-out below),
  // so point both at the bare root rather than letting a crawler treat the
  // query string as a second copy of the landing page.
  alternates: { canonical: "/" },
};

// A padlock, drawn in the same round-capped outline language as the doodles.
// It carries "locked for life" visually so the label beside it only has to
// name the number.
function LockIc({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  );
}

// The dispatcher, sitting on the top edge of the founding banner with its legs
// hanging over the front. Same 12x11 grid as the animated hero scene
// (components/pixel-dispatcher.tsx), redrawn as static rects: a canvas is
// pointless for a single frame, and this keeps the banner a server component.
// Colours live in landing.css (.found-px) - clay, same character as the hero.
const SPRITE = [
  "...bbbbbb...",
  "..bbbbbbbb..",
  ".bbbbbbbbbb.",
  ".bbbbbbbbbb.",
  ".bbbbebbbeb.",
  ".bbbbebbbeb.",
  ".bbbbbbbbbb.",
  ".bssssssssb.",
  "..ssssssss..",
  "..ss....ss..",
  "..ss....ss..",
];

function FoundingMascot() {
  return (
    <svg
      className="found-px"
      viewBox="0 0 12 11"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {SPRITE.flatMap((row, r) =>
        row
          .split("")
          .map((ch, c) =>
            ch === "." ? null : (
              <rect key={`${r}-${c}`} className={`px-${ch}`} x={c} y={r} width="1" height="1" />
            ),
          ),
      )}
    </svg>
  );
}

// Desktop plan card price. One component for all three cards so the founding
// price can never drift between them - and so "no offer" is a single branch,
// not three places to forget.
//
// Three facts, in the order a buyer reads them: the saving (tag), the number
// (price), the promise (locked for life). The label under the price used to
// read "Founding price", which after adding the tag said the same thing twice
// - the tag names the deal, so the label was freed to carry the part that is
// actually load-bearing and nowhere else on the card.
function PlanPrice({ tier, founding }: { tier: Tier; founding: FoundingOffer | null }) {
  if (!founding) {
    return (
      <div className="p-price">
        {listPriceLabel(tier)}
        <small>/mo</small>
      </div>
    );
  }
  return (
    <>
      <div className="p-off">{founding.discountPct}% off</div>
      <div className="p-price">
        <s className="p-was">
          <span className="ld-sr">Regular price </span>
          {listPriceLabel(tier)}
        </s>
        {foundingPriceLabel(tier)}
        <small>/mo</small>
      </div>
      <div className="p-found">
        <LockIc />
        Locked for life
      </div>
    </>
  );
}

// The same price, sized for a third of a phone screen. The founding variant
// stacks (was / now / per) because "$74.50/mo" on one line overflows a 320px
// three-column table.
function PmPrice({ tier, founding }: { tier: Tier; founding: FoundingOffer | null }) {
  if (!founding) {
    return (
      <span className="pm-price">
        {listPriceLabel(tier)}
        <small>/mo</small>
      </span>
    );
  }
  return (
    <>
      <span className="pm-tag">{founding.discountPct}% off</span>
      <s className="pm-was">
        <span className="ld-sr">Regular price </span>
        {listPriceLabel(tier)}
      </s>
      <span className="pm-price pm-price-f">{foundingPriceLabel(tier)}</span>
      <span className="pm-per">/mo</span>
    </>
  );
}

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.LANDING_ENABLED !== "true") redirect("/dashboard");

  // Signed-in customers get their dashboard, not the brochure - "/" is a
  // bookmark and a browser autocomplete target, so an existing user typing
  // "dispatchseo.com" means "take me in". The cheap cookie hint runs first so
  // anonymous search traffic never pays the session-verify round-trip.
  // ?home=1 opts out (the footer/legal pages link back here for pricing + FAQ,
  // and those must stay readable while signed in).
  const params = await searchParams;

  // An auth link that lands HERE still carries a live credential: Supabase
  // sends the visitor to the project's Site URL ("/") whenever the caller
  // forgot emailRedirectTo, and older confirmation emails already in inboxes
  // were minted that way. Rendering the brochure would silently drop the
  // sign-in, so hand it to the one route that can spend it. Signup now sets
  // emailRedirectTo (src/lib/origin.ts), which makes this the safety net
  // rather than the main path.
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const code = first(params.code);
  const tokenHash = first(params.token_hash);
  if (code || tokenHash) {
    const forward = new URLSearchParams();
    if (code) forward.set("code", code);
    if (tokenHash) forward.set("token_hash", tokenHash);
    const type = first(params.type);
    if (type) forward.set("type", type);
    const next = first(params.next);
    if (next) forward.set("next", next);
    redirect(`/auth/callback?${forward.toString()}`);
  }

  const signedIn = (await maybeSignedIn()) && Boolean(await dashboardAuth());
  if (params.home === undefined && signedIn) {
    redirect("/dashboard");
  }

  // A signed-in owner whose setup never finished (?home=1 is the wizard's
  // Home exit) gets the way back into the wizard right on the hero, instead
  // of retyping /onboarding or bouncing through /dashboard. Anonymous
  // traffic pays nothing here: maybeSignedIn's cookie hint short-circuits
  // before any session or project lookup.
  const midSetup = signedIn && !(await hasConfiguredProject());

  // null = no offer (self-host, billing unconfigured, past the end date, or
  // the 50 seats are gone). Every founding surface below is gated on it, so
  // expiry leaves plain list prices and no orphaned struck-through text.
  const founding = await foundingOffer();

  return (
    <div className={`ld ${jakarta.variable} ${dmSans.variable}`}>
      {/* ==================== NAV ==================== */}
      <nav>
        <div className="nav-wrap nav-in">
          <a className="logo" href="#">
            <DispatchMark className="logo-mark" />
            DispatchSEO
          </a>
          <div className="nav-links">
            <a href="#demo">Demo</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <a href="/blog">Blog</a>
          </div>
          <div className="nav-cta">
            <a className="btn btn-ghost btn-sm" href="/login">Log in</a>
            <a className="btn btn-solid btn-sm" href="/signup">Start for free</a>
          </div>
          <LandingNav githubUrl={GITHUB_URL} docsUrl={DOCS_URL} />
        </div>
      </nav>

      {/* ==================== HERO ==================== */}
      <header className="hero">
        <svg className="doodle doodle-l" viewBox="0 0 64 64" aria-hidden="true"><path d="M6 50 L22 35 L33 43 L56 15 M56 15 L45 18 M56 15 L54 27" /></svg>
        <svg className="doodle doodle-r" viewBox="0 0 48 48" aria-hidden="true"><path d="M19 17 L30 43 L33.5 32 L44 29 Z M9 8 L13 12 M6 19 L11.5 20.5 M19 5 L20.5 10.5" /></svg>
        <svg className="doodle doodle-arrow" viewBox="0 0 80 60" aria-hidden="true"><path d="M6 9 C 33 13, 55 27, 63 49 M63 49 L50 44 M63 49 L66 35" /></svg>

        <div className="wrap">
          <PixelDispatcher />
          {midSetup ? (
            <a className="resume-pill" href="/onboarding">
              <span className="rp-dot" aria-hidden="true" />
              Your site is mid-setup — pick up where you left off
              <span aria-hidden="true">→</span>
            </a>
          ) : null}
          {/* .br-desk: the composed two-line break is a desktop luxury - phones
              drop it so the headline reflows to whatever fits. */}
          <h1>Automate your SEO<br className="br-desk" /> with <span className="hl">AI agents</span></h1>
          <p className="sub">The agent that built your product now runs your SEO: keyword research, guides, interactive tools, rank tracking - all automatic.<br className="br-desk" /> Use your agent: Claude Code / Codex</p>

          <div className="cta-row" id="get-started">
            <DomainCta />
          </div>
        </div>
        {/* The mascot's aside, attached to the hero at every width and in
            normal flow - it scrolls away with the hero rather than following
            the reader. Deliberately a sibling of .wrap, not a child: it hangs
            off the hero's bottom-right corner (where it used to float), which
            means clearing .wrap's 1120px measure. See why-card.tsx. */}
        <WhyCard />
        {/* The hero's OTHER bottom corner: the way to reach a human. Mirrors
            the mascot's note exactly - absolute, 22px off the corner, .hero as
            the positioned ancestor, a sibling of .wrap so it clears the 1120px
            measure - just on the left, because the right is taken. Not
            position: fixed for the same reason the note isn't: a chat-style
            bubble that tracks the reader down the page is an interruption, and
            on a phone it is also a fixed layer repainting over the sticky nav.
            It says "there are people here" next to the CTA and gets out of the
            way. */}
        <div className="discord-hero">
          <a className="dc-link" href={DISCORD_URL} target="_blank" rel="noreferrer">
            <DiscordMark className="dc-mark" />
            Discord support
          </a>
        </div>
      </header>

      {/* ==================== FEATURES ==================== */}
      <section className="band-alt" id="features">
        <div className="wrap">
          <FeatureShowcase />
        </div>
      </section>

      {/* ==================== DEMO VIDEO ==================== */}
      <section id="demo">
        <div className="wrap">
          <div className="sec-h">
            <h2>See it running</h2>
          </div>
          <DemoVideo />
        </div>
      </section>

      {/* ==================== WHY NOW / WHO FOR ==================== */}
      <section className="band-alt">
        <div className="wrap">
          <div className="sec-h">
            <h2>Who is DispatchSEO for?</h2>
          </div>
          <div className="who">
            <div className="who-card">
              <svg className="who-doodle pink" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></svg>
              <h3>Founders with a product to ship</h3>
              <p>Your site lives in a git repo and your time is better spent on the product. Hand the content grind to your agent and keep the final say on everything.</p>
            </div>
            <div className="who-card">
              <svg className="who-doodle vio" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v5.5M12 15.5V21M3 12h5.5M15.5 12H21M5.64 5.64l3.89 3.89M14.47 14.47l3.89 3.89M18.36 5.64l-3.89 3.89M9.53 14.47l-3.89 3.89" /></svg>
              <h3>AI agent power users</h3>
              <p>You already pay for Claude Code or Codex. DispatchSEO gives it memory, schedules, and a queue, so SEO stops being a weekend project.</p>
            </div>
            <div className="who-card">
              <svg className="who-doodle blue" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8.6 9.4v.6M15.4 9.4v.6" /><path d="M8.8 15.2h6.4" /></svg>
              <h3>People who hate doing SEO</h3>
              <p>You know it works. You still put it off every week. Now the research, the writing, and the rank checks happen on a schedule, whether you feel like it or not.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== PRICING ==================== */}
      <section id="pricing">
        <div className="wrap">
          <div className="sec-h">
            <h2>Pick your plan</h2>
          </div>
          {/* One bar, two facts: the deal on the left, the deadline past a
              dashed rule on the right. The divider does the work a third
              sentence used to do, so the banner needs no paragraph. The "why
              only 50" reasoning moved to the getting-started FAQ below. */}
          {founding ? (
            <div className="found">
              <FoundingMascot />
              <div className="found-main">
                <span className="found-k">Founding price</span>
                <p className="found-v">
                  <span className="found-hl">{founding.discountPct}% off</span>
                  <span className="found-note">
                    <LockIc className="found-lock" />
                    locked for life
                  </span>
                </p>
              </div>
              <div className="found-stub">
                <span className="found-stub-k">Ends</span>
                <b className="found-stub-v">{founding.endsAtLabel}</b>
                {founding.showCount ? (
                  <span className="found-stub-n">
                    {`${founding.remaining} of ${founding.cap} left`}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="cloud-adds">
            <span className="ca-label">Every plan includes</span>
            <span className="ca-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M7 21v-5" /><path d="M12 21V9" /><path d="M17 21v-8" /></svg>bundled SERP + volume data, one bill</span>
            <span className="ca-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" /></svg>one-click Search Console connect</span>
            <span className="ca-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>managed schedules + failure alerts</span>
          </div>
          <div className="plans">
            <div className="plan">
              <h3>Starter</h3>
              <PlanPrice tier="starter" founding={founding} />
              <div className="p-sub">One site on autopilot</div>
              <ul>
                <li>Up to 1 site</li>
                <li>Unlimited articles</li>
                <li>Unlimited AI-built tools</li>
                <li>SERP + search volume data</li>
                <li>Daily rank tracking</li>
                <li>AI Overview tracking</li>
                <li>One-click Search Console</li>
                <li>Hourly Search Console sync</li>
                <li>Index status monitoring</li>
                <li>Domain rating tracking</li>
                <li>Backlink prospecting</li>
                <li>Trending topic scans</li>
                <li>Content quality checks</li>
                <li>Approve or full-auto mode</li>
                <li>Everything ships as PRs</li>
                <li>Drive it from your AI agent</li>
                <li>Managed schedules</li>
                <li>Failure alerts by email</li>
                <li>Email support</li>
              </ul>
              <a className="btn btn-solid" href="/signup">Start for free</a>
            </div>
            <div className="plan hero-plan">
              <span className="p-badge">Most popular</span>
              <h3>Growth</h3>
              <PlanPrice tier="growth" founding={founding} />
              <div className="p-sub">For a small portfolio</div>
              <ul>
                <li>Up to 3 sites<span className="li-hint"><button type="button" aria-label="What this costs on GitHub">ⓘ GitHub cost</button><span className="li-pop" role="tooltip">Your first two sites are free on your own GitHub account. After that it&apos;s about $5 per site a month, paid to GitHub, not to us.<a href="/docs/publishing#github-actions-costs">See the cost table</a></span></span></li>
                <li>Unlimited articles</li>
                <li>Unlimited AI-built tools</li>
                <li>SERP + search volume data</li>
                <li>Daily rank tracking</li>
                <li>AI Overview tracking</li>
                <li>One-click Search Console</li>
                <li>Hourly Search Console sync</li>
                <li>Index status monitoring</li>
                <li>Domain rating tracking</li>
                <li>Backlink prospecting</li>
                <li>Trending topic scans</li>
                <li>Content quality checks</li>
                <li>Approve or full-auto mode</li>
                <li>Everything ships as PRs</li>
                <li>Drive it from your AI agent</li>
                <li>Managed schedules</li>
                <li>Failure alerts by email</li>
                <li>Email support</li>
              </ul>
              <a className="btn btn-solid" href="/signup">Choose Growth</a>
            </div>
            <div className="plan">
              <h3>Scale</h3>
              <PlanPrice tier="scale" founding={founding} />
              <div className="p-sub">Portfolios and agencies</div>
              <ul>
                <li>Up to 10 sites<span className="li-hint"><button type="button" aria-label="What this costs on GitHub">ⓘ GitHub cost</button><span className="li-pop" role="tooltip">Your first two sites are free on your own GitHub account. After that it&apos;s about $5 per site a month, paid to GitHub, not to us.<a href="/docs/publishing#github-actions-costs">See the cost table</a></span></span></li>
                <li>Unlimited articles</li>
                <li>Unlimited AI-built tools</li>
                <li>SERP + search volume data</li>
                <li>Daily rank tracking</li>
                <li>AI Overview tracking</li>
                <li>One-click Search Console</li>
                <li>Hourly Search Console sync</li>
                <li>Index status monitoring</li>
                <li>Domain rating tracking</li>
                <li>Backlink prospecting</li>
                <li>Trending topic scans</li>
                <li>Content quality checks</li>
                <li>Approve or full-auto mode</li>
                <li>Everything ships as PRs</li>
                <li>Drive it from your AI agent</li>
                <li>Managed schedules</li>
                <li>Failure alerts by email</li>
                <li>Priority support</li>
              </ul>
              <a className="btn btn-solid" href="/signup">Choose Scale</a>
            </div>
          </div>

          {/* Mobile pricing (<=980px). The three plans differ in exactly three
              things - price, sites, support - so a phone gets a compare scoreboard plus one shared
              feature list instead of three near-identical twenty-row columns.
              Nothing is dropped: every feature above appears either as a
              compare row or in "On every plan". The .plans grid above is the
              desktop presentation and is hidden here. */}
          <div className="plans-m">
            <table className="pm-table">
              <caption className="ld-sr">Compare plans</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="pm-name">Starter</span>
                    <PmPrice tier="starter" founding={founding} />
                  </th>
                  <th scope="col" className="pm-pick">
                    <span className="pm-flag">Most popular</span>
                    <span className="pm-name">Growth</span>
                    <PmPrice tier="growth" founding={founding} />
                  </th>
                  <th scope="col">
                    <span className="pm-name">Scale</span>
                    <PmPrice tier="scale" founding={founding} />
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>1</b> site</td>
                  <td className="pm-pick"><b>3</b> sites</td>
                  <td><b>10</b> sites</td>
                </tr>
                <tr>
                  <td>Email support</td>
                  <td className="pm-pick">Email support</td>
                  <td>Priority support</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td><a className="btn btn-solid" href="/signup">Start free</a></td>
                  <td className="pm-pick"><a className="btn btn-solid" href="/signup">Start now</a></td>
                  <td><a className="btn btn-solid" href="/signup">Start now</a></td>
                </tr>
              </tfoot>
            </table>

            <div className="pm-all">
              <h3>On every plan</h3>
              <ul>
                <li>Unlimited articles</li>
                <li>Unlimited AI-built tools</li>
                <li>SERP + search volume data</li>
                <li>Daily rank tracking</li>
                <li>AI Overview tracking</li>
                <li>One-click Search Console</li>
                <li>Hourly Search Console sync</li>
                <li>Index status monitoring</li>
                <li>Domain rating tracking</li>
                <li>Backlink prospecting</li>
                <li>Trending topic scans</li>
                <li>Content quality checks</li>
                <li>Approve or full-auto mode</li>
                <li>Everything ships as PRs</li>
                <li>Drive it from your AI agent</li>
                <li>Managed schedules</li>
                <li>Failure alerts by email</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== FAQ ==================== */}
      <section className="faq band-alt" id="faq">
        <div className="wrap">
          <div className="sec-h">
            <h2>Fair questions</h2>
          </div>
          <div className="faq-list">
            <details open>
              <summary>Can I use DispatchSEO for free?</summary>
              <div className="a">Yes, if you self-host it. DispatchSEO is <a href={GITHUB_URL}>open source</a> (AGPL-3.0) and the self-hosted version has every feature: it runs on your machine, under your accounts, so there&apos;s nothing for us to bill. The paid cloud sells convenience: we run the machine, bundle the SERP and volume data into one bill, and replace the Google service account ritual with one click.</div>
            </details>
            <details>
              <summary>What do I need to run the free version?</summary>
              <div className="a">A website that lives in a GitHub repo, an AI agent (Claude Code on your Claude subscription, or Codex on an OpenAI key), free Google Search Console access, and a machine with Docker. Your laptop works for a test drive, but we highly recommend a machine that stays awake for real use - a $5 VPS or a Raspberry Pi - since schedules only run while it&apos;s on. Rank tracking works with a free SerpApi key; search volume data needs a DataForSEO account, which is the main gap the cloud version fills. The <a href={DOCS_URL}>docs</a> walk you through it.</div>
            </details>
            <details>
              <summary>Is this another AI content spammer?</summary>
              <div className="a">No. Every draft is reviewed for quality and sameness before it ships, publishing pace ramps up slowly on purpose, and the agent writes from your product&apos;s actual facts, with your repo as its source material. You choose the gate: approve every piece yourself, or run on auto with pull requests as the audit trail.</div>
            </details>
            <details>
              <summary>Do I need to know SEO?</summary>
              <div className="a">No. The agent does the research and explains each idea in plain language: what the keyword is, why it looks winnable, and what the article should cover. You judge whether it sounds right for your business, which is the part no tool should take from you.</div>
            </details>
            <details>
              <summary>Does it only work with Claude Code?</summary>
              <div className="a">No - Codex is fully supported too, including the overnight builders. Every scheduled workflow carries both agents and asks the dashboard which one to run, so you can switch on Settings and it takes effect on the next build, no reinstall. The honest difference is billing: Claude Code runs on the subscription you already have, Codex is metered by OpenAI per run. Beyond those two, the server speaks standard MCP, so other MCP clients (Cursor, Gemini CLI) can connect to the same tools interactively - they just can&apos;t run the unattended builders yet.</div>
            </details>
            <details>
              <summary>What does DispatchSEO do with my Google data?</summary>
              <div className="a">It reads your Google Search Console data with read-only access: the queries your site shows up for, plus clicks, impressions, and average position. That&apos;s what powers the keyword recommendations and the rank tracking. Nothing in your Google account gets modified, nothing is sold or shared, and you can disconnect anytime. Full details on the <a href="/google-data">Google data usage</a> page.</div>
            </details>
            <details>
              <summary>How do I get started on cloud?</summary>
              <div className="a">Sign up and start your 7-day free trial on Starter - you enter a card at checkout, nothing is charged until the trial ends, and you can cancel in one click before then. The setup wizard walks you through connecting your site, about ten minutes end to end. Need more sites right away? Pick Growth or Scale at checkout (billed today), or upgrade anytime.{founding ? <> Right now the first {founding.cap} sites get the founding price: {founding.discountPct}% off, locked for life, so Starter is {foundingPriceLabel("starter")}/mo instead of {listPriceLabel("starter")}. It ends {founding.endsAtLabel}. I&apos;m capping it at {founding.cap} because that&apos;s how many sites I can personally onboard and support while still building. When it&apos;s full, it&apos;s full.</> : null}</div>
            </details>
            <details>
              <summary>Are there any costs besides the subscription?</summary>
              <div className="a">One, and it&apos;s not to us: your automations run as GitHub Actions in your own repo, billed to your own GitHub account. Your first two sites or so are covered by GitHub&apos;s free tier at $0. Beyond that it&apos;s roughly $5/site/month, paid straight to GitHub with nothing added by us - GitHub Pro at $4/month is the simplest way to cover a third site.</div>
            </details>
          </div>
        </div>
      </section>

      {/* ==================== FINAL CTA ==================== */}
      <section className="final" id="start-final">
        <svg className="doodle doodle-f1" viewBox="0 0 48 56" aria-hidden="true"><path d="M10 7 L30 7 L38 15 L38 49 L10 49 Z M30 7 L30 15 L38 15 M17 27 L31 27 M17 35 L27 35" /></svg>
        <svg className="doodle doodle-f2" viewBox="0 0 64 64" aria-hidden="true"><path d="M8 52 L24 38 L34 46 L56 20 M56 20 L45 22 M56 20 L55 32" /></svg>
        <div className="wrap">
          <h2>Give your agent the keys.<br className="br-desk" /> Keep the lock.<span className="caret" /></h2>
          <p>Starter starts with a 7-day free trial. Setup takes about ten minutes.</p>
          <div className="cta-row">
            <a className="btn btn-solid" href="/signup">Start your free trial</a>
          </div>
        </div>
      </section>

      {/* ==================== FOOTER ==================== */}
      <footer>
        <div className="wrap">
          <div className="foot-grid">
            <div className="foot-brand">
              <a className="logo" href="#">
                <DispatchMark className="logo-mark" />
                DispatchSEO
              </a>
              <p>The open-source SEO autopilot for AI agents. The agent that knows your product, running its SEO for you.</p>
            </div>
            <div className="foot-col">
              <h4>Product</h4>
              <a href="#demo">Demo</a>
              <a href="#features">Features</a>
              <a href="#pricing">Pricing</a>
              <a href="#faq">FAQ</a>
              <a href="/claude-code">DispatchSEO for Claude Code</a>
              <a href="/codex">DispatchSEO for Codex</a>
            </div>
            <div className="foot-col">
              <h4>Open source</h4>
              <a href={GITHUB_URL}>GitHub</a>
              <a href={DISCORD_URL} target="_blank" rel="noreferrer">Discord</a>
              <a href={DOCS_URL}>Docs</a>
              <a href="/docs/docker-compose">Self-host guide</a>
              <a href={GITHUB_URL}>AGPL-3.0 license</a>
            </div>
            <div className="foot-col">
              <h4>Company</h4>
              <a href="/signup">Get started</a>
              <a href="/blog">Blog</a>
              <a href="/privacy">Privacy policy</a>
              <a href="/terms">Terms of service</a>
              <a href="/google-data">Google data usage</a>
              <a href="/subprocessors">Subprocessors</a>
              <a href="/login">Log in</a>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© DispatchSEO 2026</span>
            <span className="foot-made">
              <svg className="cc-mark" viewBox="24 118 464 262" aria-hidden="true">
                <defs>
                  <linearGradient id="ccGaugeTrack" x1="0.08" y1="0" x2="0.92" y2="0">
                    <stop offset="0" stopColor="#6f6a62" />
                    <stop offset="0.55" stopColor="#c96442" />
                    <stop offset="1" stopColor="#d77e5c" />
                  </linearGradient>
                </defs>
                <path d="M46 349 A210 210 0 0 1 466 349" fill="none" stroke="url(#ccGaugeTrack)" strokeWidth="34" strokeLinecap="round" />
                <rect x="37" y="340" width="18" height="18" fill="#9b958c" />
                <rect x="65" y="235" width="18" height="18" fill="#9b958c" />
                <rect x="142" y="158" width="18" height="18" fill="#9b958c" />
                <rect x="247" y="130" width="18" height="18" fill="#9b958c" />
                <rect x="352" y="158" width="18" height="18" fill="#cf6e4a" />
                <rect x="429" y="235" width="18" height="18" fill="#c96442" />
                <rect x="457" y="340" width="18" height="18" fill="#d77e5c" />
                <polygon points="262.75,365.7 249.25,332.3 423,281.5" fill="#f5f3ec" />
                <circle cx="256" cy="349" r="28" fill="#f5f3ec" />
                <circle cx="256" cy="349" r="12" fill="#c96442" />
              </svg>
              Made with <a href="https://clockedcode.com">ClockedCode</a>
            </span>
            <span className="foot-oss">Proudly <a href={GITHUB_URL}>open source</a> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20s-7-4.35-9.3-8.6A5 5 0 0 1 12 6a5 5 0 0 1 9.3 5.4C19 15.65 12 20 12 20Z" /></svg></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
