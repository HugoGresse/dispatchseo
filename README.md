<p align="center">
  <a href="https://dispatchseo.com">
    <img src="src/app/icon.png" width="116" alt="DispatchSEO logo">
  </a>
</p>

<h1 align="center">DispatchSEO</h1>

<p align="center">
  <a href="LICENSE"><img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-7C5CFC?labelColor=1F2328&style=flat-square"></a>
  <a href="https://claude.com/product/claude-code"><img alt="Built for Claude Code" src="https://img.shields.io/badge/built%20for-Claude%20Code-D97757?logo=claude&logoColor=white&labelColor=1F2328&style=flat-square"></a>
  <a href="#-quick-start"><img alt="Self-host in one command" src="https://img.shields.io/badge/self--host-one%20command-2496ED?logo=docker&logoColor=white&labelColor=1F2328&style=flat-square"></a>
  <a href="https://discord.gg/jqbtN98EHA"><img alt="Join the Discord" src="https://img.shields.io/badge/Discord-join%20the%20server-5865F2?logo=discord&logoColor=white&labelColor=1F2328&style=flat-square"></a>
</p>

<div align="center">
  <strong>
  <h2>Turn Claude Code into your SEO manager</h2><br />
  <a href="https://dispatchseo.com">DispatchSEO</a>: an open-source alternative to SEObot and Outrank.<br /><br />
  </strong>
  Other SEO tools learn about your product by crawling your homepage. Your agent already knows it,<br />so DispatchSEO gives that agent the missing half: keyword research, content that ships as pull requests, and rank tracking.
</div>

<div align="center">
  <br />
  <img alt="Claude Code" src="docs/brand/icons/claude.svg" width="32">
  &nbsp;
  <img alt="MCP" src="docs/brand/icons/mcp.svg" width="32">
  &nbsp;
  <img alt="GitHub" src="docs/brand/icons/github.svg" width="32">
  &nbsp;
  <img alt="Google Search Console" src="docs/brand/icons/search-console.svg" width="32">
  &nbsp;
  <img alt="Google" src="docs/brand/icons/google.svg" width="32">
  &nbsp;
  <img alt="Docker" src="docs/brand/icons/docker.svg" width="32">
</div>

<p align="center">
  <br />
  <a href="#-quick-start"><img src="docs/buttons/install.svg" alt="Install in one command" height="46"></a>
  &nbsp;
  <a href="https://dispatchseo.com/docs"><img src="docs/buttons/docs.svg" alt="Read the docs" height="46"></a>
  &nbsp;
  <a href="https://www.youtube.com/watch?v=1gCXPxPqfy0"><img src="docs/buttons/demo.svg" alt="Watch the demo" height="46"></a>
</p>

<p align="center">
  <a href="https://dispatchseo.com">Website</a>
  &nbsp;&middot;&nbsp;
  <a href="https://dispatchseo.com/docs/docker-compose">Self-host on your computer</a>
  &nbsp;&middot;&nbsp;
  <a href="https://dispatchseo.com/docs/vps">Self-host on a VPS</a>
  &nbsp;&middot;&nbsp;
  <a href="https://discord.gg/jqbtN98EHA">Discord</a>
  &nbsp;&middot;&nbsp;
  <a href="https://github.com/NeoZi12/dispatchseo/discussions">Discussions</a>
  &nbsp;&middot;&nbsp;
  <a href="https://dispatchseo.com">Hosted version</a>
</p>

<p align="center"><i>Self-hosted has zero feature limitations. Everything the paid<br />cloud does, this repo does today, in your own accounts, at $0.</i></p>

<p align="center">
  <a href="https://www.youtube.com/watch?v=1gCXPxPqfy0">
    <img src="https://img.youtube.com/vi/1gCXPxPqfy0/maxresdefault.jpg" alt="DispatchSEO preview video - the dashboard, the queue, and a pipeline-built pull request, walked through end to end">
  </a>
  <br>
  <sub>▶ Watch the preview</sub>
</p>

<br />

## ⚡ How it works

1. **Your agent researches.** Claude Code connects to DispatchSEO over MCP,
   reads the served playbook, and mines keywords from your Search Console
   data, Google Autocomplete, and what it already knows about your product.
   Ideas land in a queue with the reasoning attached.
2. **You approve, or don't.** Each idea is a card on the dashboard: the
   keyword, why it's winnable, the angle. Approve, reject, or reorder.
   Prefer full autopilot? Flip on auto mode and skip the queue entirely.
3. **The pipeline builds.** Every morning a scheduled job picks the oldest
   approved idea and builds it into a real pull request against your site's
   repo: a guide or a small free tool, checked against the live SERP and run
   through a sameness reviewer so page twelve doesn't read like page three.
4. **It tracks what happened.** Daily rank checks, hourly Search Console
   snapshots, index verification, and a journey view that tells you which
   SEO stage you're actually in. When a scheduled job breaks, you get a red
   banner and an email instead of silence.

The backend is deliberately boring: state, scheduling, and an approval gate.
The thinking happens in your agent, where your product knowledge already
lives.

<table>
  <tr>
    <td colspan="2"><img src="docs/screenshots/home.png" alt="The dashboard Home: journey stage, publishing pace, and live Search Console stats for a connected site"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/queue.png" alt="The queue: keyword ideas with volume and difficulty, each waiting for approval or set to auto"></td>
    <td><img src="docs/screenshots/guide-pr.png" alt="A pull request the pipeline built: target keyword, SERP gate verdict, archetype, and information-gain asset, all named in the description"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/search-traffic.png" alt="Search traffic: clicks and impressions from Google Search Console, snapshotted hourly"></td>
    <td><img src="docs/screenshots/rankings.png" alt="Keyword rankings: daily position checks with 30-day trend sparklines"></td>
  </tr>
</table>

## ✅ What you need before you start

- **Your site's source in a GitHub repo.** The pipeline ships content as pull
  requests, so git-based sites only - WordPress won't work.
- **A Claude subscription with Claude Code.** Your agent is the engine and it
  runs on your existing plan.
- **A machine with Docker** (~1 GB RAM). A laptop works for a test drive, but
  a machine that stays on is much better for daily use - a $5 VPS, a Raspberry
  Pi, a desktop that never sleeps. Schedules only run while the machine is awake.
- **Google Search Console access** to your site.

That's the whole list. No API keys to buy, and no account on our side.

## 🚀 Quick start

Installing is one command on any machine with Docker. On a VPS, `ssh` in first
and run it there instead of on your own computer. Run it from any plain folder
(not inside your website's repo - it creates its own `dispatchseo` folder):

```bash
git clone https://github.com/NeoZi12/dispatchseo &&
  cd dispatchseo &&
  sh start.sh
```

On Windows, paste this version instead. It works in plain PowerShell
([Git](https://git-scm.com/downloads/win) must be installed) and installs into
your user folder no matter where the window opened:

```powershell
cd ~; git clone https://github.com/NeoZi12/dispatchseo; cd dispatchseo; .\start.cmd
```

That one command really is the whole install: database, migrations, schedules,
and a headless Claude Code builder all come up together. Nothing on the internet
needs to reach your machine, so there is no domain or port forwarding to set up.

When it finishes it prints your dashboard URL. Open it and the setup wizard takes
over: name your site, connect Search Console, point it at your GitHub repo.

The last step is pasting one command into Claude Code inside your site's repo.
Your agent does the rest of the install itself, including writing its own workflow
files and setting its own secrets.

Step-by-step walkthroughs, with screenshots:
[install on your computer](https://dispatchseo.com/docs/docker-compose) ·
[install on a VPS](https://dispatchseo.com/docs/vps). The VPS guide also covers
your own domain with automatic HTTPS.

**Stuck?** The [troubleshooting page](https://dispatchseo.com/docs/troubleshooting)
covers the errors people actually hit. If yours isn't there, ask in the
[Discord](https://discord.gg/jqbtN98EHA) or in
[Discussions](https://github.com/NeoZi12/dispatchseo/discussions) - questions get
answered and usually turn into a docs fix.

## 📖 Documentation

Everything is at **[dispatchseo.com/docs](https://dispatchseo.com/docs)** - every
page, every setting, every tool.

| | |
| --- | --- |
| **New here** | [What DispatchSEO is](https://dispatchseo.com/docs/introduction) · [How it works](https://dispatchseo.com/docs/how-it-works) · [Cloud or self-hosted](https://dispatchseo.com/docs/choosing-how-to-run-it) |
| **Install** | [Your own computer](https://dispatchseo.com/docs/docker-compose) · [A VPS](https://dispatchseo.com/docs/vps) · [From source](https://dispatchseo.com/docs/local-development) |
| **Set up** | [Install Claude Code](https://dispatchseo.com/docs/install-claude-code) · [The setup wizard](https://dispatchseo.com/docs/setup-wizard) · [Search Console](https://dispatchseo.com/docs/search-console) · [Keyword data](https://dispatchseo.com/docs/keyword-data) · [Publishing](https://dispatchseo.com/docs/publishing) · [Connect your site](https://dispatchseo.com/docs/connect-your-site) |
| **Use it** | [Day to day](https://dispatchseo.com/docs/day-to-day) · [The dashboard](https://dispatchseo.com/docs/dashboard) · [Automations](https://dispatchseo.com/docs/automations) · [Agent commands](https://dispatchseo.com/docs/agent-commands) |
| **Reference** | [Concepts](https://dispatchseo.com/docs/concepts) · [MCP tools](https://dispatchseo.com/docs/mcp-tools) · [Environment variables](https://dispatchseo.com/docs/environment-variables) · [Schedules](https://dispatchseo.com/docs/schedules) · [Architecture](https://dispatchseo.com/docs/architecture) |
| **Help** | [Troubleshooting](https://dispatchseo.com/docs/troubleshooting) · [Common questions](https://dispatchseo.com/docs/faq) · [Security](https://dispatchseo.com/docs/security) · [Upgrading](https://dispatchseo.com/docs/upgrading) |

**Pointing an agent at this?** Add `.md` to any docs URL for clean markdown, or
fetch the entire documentation set in one request:
**[llms-full.txt](https://dispatchseo.com/llms-full.txt)**. There's an index at
[llms.txt](https://dispatchseo.com/llms.txt) and a [SKILL.md](SKILL.md) that
walks an agent through connecting a site.

## 🗓️ Using it day to day

Once the wizard is done, the loop is small on purpose:

| When | You do | It does |
| --- | --- | --- |
| Once a week, 5 minutes | Open the dashboard, work through the queue - approve, reject, reorder | Refills the queue with researched ideas and the reasoning behind each one |
| Every morning | Nothing | Builds the oldest approved idea into a pull request on your repo |
| When a PR lands | Review and merge (or let auto-merge do it) | Logs the page, requests indexing, starts tracking its keyword |
| Whenever you want | Ask Claude Code: *"research keywords for me"*, *"what should I write next?"*, *"how are we ranking?"* | Answers from live data over MCP - same state the dashboard shows |

The dashboard's Home page always names the next action, so you don't have to work
out what to do when you open it.

## 🧰 What's in the box

- **MCP server** with [52 tools](https://dispatchseo.com/docs/mcp-tools): the
  queue, keywords, rankings, pages, GSC stats, backlink prospects, trend
  topics, site profile. Anything the dashboard can do, your agent can do over
  MCP; parity between the two is a hard rule in this codebase.
- **Trend radar**: scan for rising topics in your niche, expand a topic into
  concrete guide angles, and queue the good ones.
- **Guide and tool builders**: guides publish at most one per day, flat and
  permanent (so a queue of thirty approved ideas doesn't become thirty posts
  in a week); free-tool ideas build on approval.
- **Backlink playbook**: a prospect list prefilled with your product's copy,
  tracked per submission.
- **Multi-site**: one deployment manages any number of sites. Each project
  gets its own MCP token, its own data, its own settings.
- **A password-gated dashboard** for the one human in the loop.

## 💵 What it costs to run

Nothing, unless you want paid data. The tiers stack:

| Tier | Price | What you get |
| --- | --- | --- |
| Search Console only | **$0** | Rankings from GSC, keyword ideas from Autocomplete plus your own impression data |
| + SerpApi free key | **$0** | Live SERP checks, real positions weekly (250 free searches/month) |
| + DataForSEO | pay per call | Search volume, keyword difficulty, domain rating |

Free mode finds keywords you can win. Paid mode also knows which ones are
worth winning.

## ☁️ Cloud version

There's a hosted version for people who'd rather not run a machine: we host it,
bundle the SERP + volume data into one bill, and replace the Google
service-account ritual with one click. It's at
[dispatchseo.com](https://dispatchseo.com). Self-hosting stays feature-complete
either way - the cloud sells convenience, not capability.

## 🧑‍💻 Developing from source

```bash
git clone https://github.com/NeoZi12/dispatchseo
cd dispatchseo
pnpm install
cp .env.local.example .env.local
pnpm dev
```

This is the contributor path, not the way to self-host (that's the Docker
command above). Fill in `.env.local` (Supabase + the three secrets) before
starting, then open the dashboard on **localhost:3000**.

`pnpm build` is the typecheck - run it before opening a PR. There is no
separate lint or test setup.

## 🏗️ Architecture, briefly

Next.js App Router, Postgres for state (a bundled container when self-hosted,
Supabase in the cloud version), `mcp-handler` for the MCP server at `/api/mcp`.
Schedules and builds run in-stack (cron + builder containers) or on GitHub
Actions. One deployment is multi-tenant: the MCP bearer token selects the
project, crons loop over all projects, the dashboard switches with a cookie.

[Architecture](https://dispatchseo.com/docs/architecture) covers this properly.
[CLAUDE.md](CLAUDE.md) has the full conventions; it's written for agents, which
turns out to make it decent documentation for people.

## 🤝 Contributing

Issues before PRs, and you must understand every line you submit, including the
AI-assisted ones. Details in [CONTRIBUTING.md](CONTRIBUTING.md). Questions go to
[Discussions](https://github.com/NeoZi12/dispatchseo/discussions) or the
[Discord](https://discord.gg/jqbtN98EHA); vulnerabilities go through
[private reporting](SECURITY.md).

## 📄 License

[AGPL-3.0](LICENSE). Use it, self-host it, fork it. If you run a modified
version as a service, share the source. That's the whole deal.

---

<p align="center">
  <sub>Built by <a href="https://github.com/NeoZi12">NeoZi12</a> · If DispatchSEO is useful to you, a ⭐ helps other people find it.</sub>
</p>
