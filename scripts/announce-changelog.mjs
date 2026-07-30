#!/usr/bin/env node
// Announces new changelog releases to Discord, straight from the one list that
// already defines them - src/lib/changelog.ts. The dashboard banner, the
// /changelog page, the get_changelog MCP tool and now the Discord server all
// read that same array, so a release is still written exactly once, in the
// owner's language, and never re-typed for an audience.
//
// What counts as "new" is decided by diffing versions against a previous copy
// of the file (the workflow hands over `git show HEAD^:src/lib/changelog.ts`),
// NOT by "the file changed" - fixing a typo in an old entry, reordering, or
// touching the helpers below the array must never re-announce anything. With
// no previous copy to compare against, only the head entry is eligible, so a
// first run can't dump 25 historical releases into the channel.
//
// The post is a SUMMARY of the entry, not a copy of it: headline, the summary
// line, and each change trimmed to its first sentence or two, grouped by kind.
// Someone scrolling a Discord channel should learn what shipped at a glance
// and click through only if they want the reasoning - so the caps under
// "Discord's own limits" are deliberately far tighter than Discord requires.
//
// It waits for the release to actually be live on /changelog before posting,
// because the embed links to `#v-<version>` - announcing a release the site
// isn't serving yet is a dead link in a permanent, public channel.
//
//   node scripts/announce-changelog.mjs --previous /tmp/prev-changelog.ts
//   node scripts/announce-changelog.mjs --version 2026-07-30.8 --dry-run
//
// Env: DISCORD_WEBHOOK_URL (required unless --dry-run), SITE_URL
// (default https://dispatchseo.com), DISCORD_MENTION (optional, e.g. a role
// ping like `<@&123>` posted as the message content above the embed).

import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------- arguments

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const dryRun = flag("dry-run");
const noWait = flag("no-wait") || dryRun;
const previousPath = opt("previous");
const forcedVersion = opt("version");
const webhook = process.env.DISCORD_WEBHOOK_URL?.trim();
const site = (process.env.SITE_URL?.trim() || "https://dispatchseo.com").replace(/\/+$/, "");
const mention = process.env.DISCORD_MENTION?.trim() || "";

// A release announcement is public and permanent. Cap how much one run can
// ever say, so a bad diff (a rewritten file, a squashed branch) posts a few
// messages someone can delete rather than flooding the channel.
const MAX_POSTS = 5;

// A Discord post is not the changelog. The changelog entry argues the case -
// what changed, why, what it replaces - and reads well when you went looking
// for it. A post arrives uninvited in a feed, so it gets the headline and
// nothing else: someone should learn what shipped in one glance and click
// through only if they want the reasoning. These caps are what enforce that,
// and they're well under what Discord would allow.
const BULLET_MAX = 200; // per change line - roughly one scannable sentence
const MAX_BULLETS = 5; // per kind, then "…and N more"
const DESC_MAX = 350; // the summary line
const FIELD_MAX = 1024; // hard Discord limit on a field value
const EMBED_BUDGET = 5500; // hard limit is 6000 across the whole embed

const KIND = {
  new: { label: "✨ Added", color: 0x34d399 }, // emerald-400, as on /changelog
  improved: { label: "⚡ Improved", color: 0x38bdf8 }, // sky-400
  fixed: { label: "🔧 Fixed", color: 0xa3a3a3 }, // neutral-400
};
const KIND_ORDER = ["new", "improved", "fixed"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function die(msg) {
  console.error(`announce-changelog: ${msg}`);
  process.exit(1);
}

// ------------------------------------------------------- reading the source

// changelog.ts is pure data with no imports, so Node's type stripping can load
// it directly - no build step, no second copy of the content to drift.
async function loadChangelog(path) {
  const mod = await import(pathToFileURL(resolve(path)).href);
  if (!Array.isArray(mod.CHANGELOG)) throw new Error(`${path} exports no CHANGELOG array`);
  return mod;
}

const current = await loadChangelog(join(root, "src", "lib", "changelog.ts"));
const { CHANGELOG, anchorFor } = current;
if (!CHANGELOG.length) die("CHANGELOG is empty - nothing to announce");

/** The releases this run should post, oldest first (so the newest lands last). */
async function selectEntries() {
  if (forcedVersion) {
    const entry = CHANGELOG.find((e) => e.version === forcedVersion);
    if (!entry) die(`no changelog entry with version "${forcedVersion}"`);
    return [entry];
  }

  if (!previousPath || !existsSync(previousPath)) {
    // No baseline: the head entry is the only thing that can honestly be
    // called "new". Everything older is already out in the world.
    console.log("No previous changelog to diff against - considering the head entry only.");
    return [CHANGELOG[0]];
  }

  const previous = await loadChangelog(previousPath);
  const known = new Set(previous.CHANGELOG.map((e) => e.version));
  const fresh = CHANGELOG.filter((e) => !known.has(e.version)).reverse();
  if (fresh.length > MAX_POSTS) {
    const dropped = fresh.length - MAX_POSTS;
    console.log(
      `${fresh.length} new releases in one push - posting the newest ${MAX_POSTS}, skipping ${dropped} older one(s).`,
    );
    return fresh.slice(-MAX_POSTS);
  }
  return fresh;
}

// -------------------------------------------------------- building the post

function clamp(text, max) {
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

// Trim to whole sentences rather than to a character count. Changelog entries
// are written headline-first - "Codex is a full alternative to Claude Code."
// and then the detail - so taking the sentences that fit under the cap keeps
// the point and drops the argument, with no "…" mid-thought. A first sentence
// that busts the cap on its own is the only case that gets cut mid-sentence.
// Two sentences at most, and never past `max`. Two is what "headline plus the
// one thing you'd ask next" costs; the third sentence in a changelog entry is
// almost always the justification, which is what the link is for. The sentence
// budget is what makes short headline fragments work - "Changed your mind?"
// alone says nothing, so it keeps the sentence that follows it.
function condense(text, max, maxSentences = 2) {
  const s = text.replace(/\s+/g, " ").trim();
  const sentences = s.split(/(?<=[.!?])\s+/);
  let out = sentences[0];
  for (const next of sentences.slice(1, maxSentences)) {
    if (out.length + 1 + next.length > max) break;
    out += ` ${next}`;
  }
  // A headline fragment whose follow-up didn't fit is worse than a cut
  // sentence: "A Coding agent setting." on its own tells a reader nothing,
  // where the same line truncated mid-clause at least says what it does. So
  // when the sentence rules leave too little to be worth reading, take the
  // next sentence anyway and let the character cap do the cutting.
  if (out.length < 60 && sentences.length > 1) out = `${sentences[0]} ${sentences[1]}`;
  return out.length > max ? clamp(out, max) : out;
}

/** One kind's bullets, split across as many fields as Discord's 1024 needs. */
function packFields(label, items) {
  const fields = [];
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    fields.push({ name: fields.length ? `${label} (cont.)` : label, value: buf.join("\n") });
    buf = [];
  };
  for (const item of items) {
    const projected = buf.length ? buf.join("\n").length + 1 + item.length : item.length;
    if (projected > FIELD_MAX) flush();
    buf.push(item);
  }
  flush();
  return fields;
}

function buildEmbed(entry) {
  const url = `${site}/changelog#${anchorFor(entry.version)}`;
  const kinds = new Set(entry.changes.map((c) => c.kind));
  // One colour per release, picked the way the site picks it: the most
  // significant kind present wins, so a fix-only release reads quieter.
  const color = KIND[KIND_ORDER.find((k) => kinds.has(k)) ?? "fixed"].color;

  const title = clamp(entry.title, 240);
  // Three sentences here, two per bullet: the summary is the one place that
  // gets to set context, and it's already written to be short (it's the line
  // the dashboard banner shows).
  const description = condense(entry.summary, DESC_MAX, 3);
  let spent = title.length + description.length + 80; // + footer, roughly

  // Every field, tagged with where it belongs in the embed (`order`) and how
  // much it deserves to survive a squeeze (`rank`). A kind's FIRST field
  // outranks every continuation field, so an overlong release still shows
  // something under each of Added / Improved / Fixed rather than spending the
  // whole budget on Added and silently dropping the other two.
  const wanted = [];
  KIND_ORDER.forEach((kind, group) => {
    const all = entry.changes.filter((c) => c.kind === kind);
    const items = all.slice(0, MAX_BULLETS).map((c) => `• ${condense(c.text, BULLET_MAX)}`);
    // A release with eleven fixes doesn't get eleven lines. Five and a count
    // says the same thing and still fits on one screen.
    if (all.length > items.length) items.push(`• *…and ${all.length - items.length} more*`);
    packFields(KIND[kind].label, items).forEach((field, i) => {
      wanted.push({ ...field, group, order: wanted.length, rank: i === 0 ? 0 : 1 + i });
    });
  });

  const kept = [];
  const truncatedGroups = new Set();
  let dropped = 0;
  for (const field of [...wanted].sort((a, b) => a.rank - b.rank || a.order - b.order)) {
    const cost = field.name.length + field.value.length;
    // Once a group loses a continuation field, drop the rest of that group
    // too - a gap in the middle of one list reads as scrambled, where a clean
    // "there's more" tail reads as trimmed.
    if (truncatedGroups.has(field.group) || kept.length >= 24 || spent + cost > EMBED_BUDGET) {
      truncatedGroups.add(field.group);
      dropped++;
      continue;
    }
    kept.push(field);
    spent += cost;
  }

  const fields = kept
    .sort((a, b) => a.order - b.order)
    .map(({ name, value }) => ({ name, value }));
  // Always, not just when something was trimmed: every post is a summary now,
  // so the way to the whole story shouldn't depend on how much got cut.
  fields.push({
    name: "​",
    value: `[${dropped ? "There's more in the full release notes" : "Full release notes"} →](${url})`,
  });

  return {
    title,
    url,
    description,
    color,
    fields,
    footer: { text: `DispatchSEO · ${entry.version}` },
    timestamp: new Date(`${entry.date}T12:00:00Z`).toISOString(),
  };
}

// ------------------------------------------------------------ waiting + posting

/** Don't link to a release the site isn't serving yet. */
async function waitForLive(versions) {
  const url = `${site}/changelog`;
  const deadline = Date.now() + 10 * 60 * 1000;
  let lastNote = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, {
        headers: { "cache-control": "no-cache" },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const html = await res.text();
        const missing = versions.filter((v) => !html.includes(anchorFor(v)));
        if (!missing.length) {
          console.log(`${url} is serving ${versions.join(", ")}.`);
          return;
        }
        lastNote = `waiting for ${missing.join(", ")} to go live`;
      } else {
        lastNote = `${url} returned HTTP ${res.status}`;
      }
    } catch (e) {
      lastNote = `${url} unreachable (${e instanceof Error ? e.message : String(e)})`;
    }
    console.log(`${lastNote} - retrying in 15s`);
    await sleep(15_000);
  }
  die(
    `gave up after 10 minutes: ${lastNote}. The deploy carrying this release probably failed - ` +
      `nothing was announced, so re-run this workflow once the site is serving it.`,
  );
}

async function post(payload) {
  const endpoint = new URL(webhook);
  endpoint.searchParams.set("wait", "true"); // make Discord answer with the message, not a bare 204
  for (let attempt = 1; attempt <= 5; attempt++) {
    let res;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      if (attempt === 5) throw e;
      await sleep(2000 * attempt);
      continue;
    }
    if (res.ok) return;
    const body = await res.text().catch(() => "");
    if (res.status === 429) {
      let wait = 5000;
      try {
        wait = Math.ceil((JSON.parse(body).retry_after ?? 5) * 1000);
      } catch {
        /* keep the default */
      }
      console.log(`Rate-limited by Discord, waiting ${wait}ms`);
      await sleep(Math.min(wait + 500, 60_000));
      continue;
    }
    if (res.status >= 500) {
      if (attempt === 5) throw new Error(`Discord is failing: HTTP ${res.status} ${body}`);
      await sleep(2000 * attempt);
      continue;
    }
    // 401/404 means the webhook URL is wrong or was deleted in Discord;
    // 400 means the embed itself is malformed. Neither is worth retrying.
    throw new Error(
      `Discord rejected the post: HTTP ${res.status} ${body.slice(0, 300)}` +
        (res.status === 401 || res.status === 404
          ? " - the DISCORD_WEBHOOK_URL secret is wrong or the webhook was deleted in Discord"
          : ""),
    );
  }
  throw new Error("Discord rate-limited five attempts in a row - nothing was posted");
}

// ------------------------------------------------------------------- run it

const entries = await selectEntries();
if (!entries.length) {
  console.log("No new release in this change - nothing to announce.");
  process.exit(0);
}
console.log(`Announcing: ${entries.map((e) => e.version).join(", ")}`);

if (!webhook && !dryRun) {
  die("DISCORD_WEBHOOK_URL is not set - add it as a repository secret (Discord: Server Settings → Integrations → Webhooks)");
}

if (!noWait) await waitForLive(entries.map((e) => e.version));

for (const [i, entry] of entries.entries()) {
  const payload = { embeds: [buildEmbed(entry)] };
  if (mention) payload.content = mention;
  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    continue;
  }
  await post(payload);
  console.log(`Posted ${entry.version} - "${entry.title}"`);
  if (i < entries.length - 1) await sleep(1500); // stay well under the webhook rate limit
}

console.log(dryRun ? "Dry run - nothing was posted." : `Done: ${entries.length} announced.`);
