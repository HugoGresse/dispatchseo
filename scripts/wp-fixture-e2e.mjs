// End-to-end publish test against five real WordPress installs.
//
// Run:
//   docker compose -f docker/wp-fixtures/docker-compose.yml up -d
//   node --experimental-strip-types scripts/wp-fixture-e2e.mjs           # all five
//   node --experimental-strip-types scripts/wp-fixture-e2e.mjs vanilla   # one
//
// The flag is needed because it imports the real TypeScript publisher rather
// than a JavaScript copy of it that could drift.
//
// It installs each site with WP-CLI (idempotent - safe to re-run), activates
// the plugin that makes that fixture interesting, creates an Editor user and a
// real Application Password, then drives the shipped publisher through the
// whole chain: connect -> upload a cover -> create a draft -> publish it ->
// load the public URL and check what actually rendered.
//
// WHY IT PATCHES THE MODULE IT TESTS
//
// src/lib/wordpress.ts refuses plain HTTP and refuses private addresses, on
// every request and on every redirect hop. That is an SSRF guard and it is the
// single most important line in the file - a customer-supplied URL is the
// classic way to make a server fetch things it should not. Localhost fixtures
// are, by definition, exactly what it exists to block.
//
// So this script rewrites those two conditions - and ONLY those two - in a
// copy, and imports the copy. Everything else under test is the real code: the
// error taxonomy, the redirect handling, the capability parsing, the
// term-resolution race, the create-then-publish sequence. Each substitution is
// asserted, so if someone reshapes the guard, this fails loudly with "the
// guard no longer looks like this" instead of quietly testing a stale copy.
//
// The alternative - a WORDPRESS_ALLOW_INSECURE env flag in the shipped module
// - was rejected: a switch that turns off an SSRF guard is one misconfigured
// deploy away from being on in production, and no test is worth that.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const exec = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NETWORK = "dispatchseo-wp-fixtures_default";
const ADMIN_PASS = "fixture-admin-pass";
const EDITOR_PASS = "fixture-editor-pass";

const FIXTURES = [
  { key: "vanilla", port: 8081, db: "wp_vanilla", plugin: null, title: "Vanilla WP" },
  { key: "elementor", port: 8082, db: "wp_elementor", plugin: "elementor", title: "Elementor WP" },
  { key: "yoast", port: 8083, db: "wp_yoast", plugin: "wordpress-seo", title: "Yoast WP", seoPlugin: "yoast" },
  {
    key: "rankmath", port: 8084, db: "wp_rankmath", plugin: "seo-by-rank-math",
    title: "RankMath WP", seoPlugin: "rankmath",
    // RankMath registers NOTHING until its setup wizard has been run - no REST
    // namespace, no HTML signature, nothing. Verified on 1.0.276: the
    // namespace appears the moment these options exist and not before. So an
    // installed-but-unconfigured RankMath is genuinely undetectable, and a
    // fixture that skipped this step would be testing a site nobody runs.
    // (Yoast, by contrast, registers yoast/v1 the moment it is activated.)
    afterInstall: [
      ["option", "update", "rank_math_registration_skip", "1"],
      ["option", "update", "rank-math-options-general", '{"support_rank_math":"off"}', "--format=json"],
      ["rewrite", "flush", "--hard"],
    ],
  },
  // The one that must FAIL, by name. "Disable REST API" (slug disable-json-api)
  // blocks the REST routes for unauthenticated callers, which is the shape a
  // locked-down site presents - the same rest_authentication_errors filter
  // every security plugin uses. What is under test is not that it works, but
  // that it fails with a named reason and a sentence an owner can act on.
  {
    key: "hardened", port: 8085, db: "wp_hardened", plugin: "disable-json-api",
    title: "Hardened WP", mustFail: true,
  },
];

const only = process.argv[2];
const fixtures = only ? FIXTURES.filter((f) => f.key === only) : FIXTURES;
if (fixtures.length === 0) {
  console.error(`Unknown fixture "${only}". One of: ${FIXTURES.map((f) => f.key).join(", ")}`);
  process.exit(1);
}

let failures = 0;
const say = (fixture, ok, label, detail = "") =>
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` - ${detail}` : ""}`) ||
  (ok ? null : failures++);

// --- the patched copy ------------------------------------------------------

async function loadPublisher() {
  const dir = await mkdtemp(join(tmpdir(), "wp-fixture-"));
  // url-guard and its own imports come along unchanged; only wordpress.ts is
  // rewritten, and only in the two places named below.
  for (const f of ["url-guard.ts", "wordpress.ts"]) {
    await cp(join(ROOT, "src/lib", f), join(dir, f));
  }
  let src = await readFile(join(dir, "wordpress.ts"), "utf8");
  src = src.replace(/from "\.\/url-guard"/g, 'from "./url-guard.ts"');

  const patches = [
    // Plain HTTP, on the first request and on every redirect hop.
    [/(\w+)\.protocol !== "https:"/g, "false /* fixture: http allowed */ && $1.protocol !== \"https:\"", 3],
    // Private addresses - localhost is one.
    [/isPrivateHost\((\w+)\.hostname\)/g, "false /* fixture: localhost allowed */ && isPrivateHost($1.hostname)", 3],
  ];
  for (const [re, to, expected] of patches) {
    const hits = src.match(re)?.length ?? 0;
    if (hits !== expected) {
      throw new Error(
        `wordpress.ts's transport guard no longer looks like this: expected ${expected} matches of ${re}, found ${hits}. ` +
          `Re-read the guard and update this script rather than loosening the guard.`,
      );
    }
    src = src.replace(re, to);
  }
  await writeFile(join(dir, "wordpress.ts"), src);
  return import(pathToFileURL(join(dir, "wordpress.ts")).href);
}

// --- WP-CLI ----------------------------------------------------------------

async function wp(fixture, args, { allowFail = false } = {}) {
  const argv = [
    "run", "--rm", "--network", NETWORK,
    "--volumes-from", `dispatchseo-wp-fixtures-wp-${fixture.key}-1`,
    "-u", "33:33",
    "-e", "WORDPRESS_DB_HOST=db", "-e", "WORDPRESS_DB_USER=wp",
    "-e", "WORDPRESS_DB_PASSWORD=wp", "-e", `WORDPRESS_DB_NAME=${fixture.db}`,
    // wp-cli wants a writable HOME for its download cache; without one every
    // call prints a permission warning that buries the real output.
    "-e", "HOME=/tmp",
    "wordpress:cli", "wp", ...args,
  ];
  try {
    const { stdout } = await exec("docker", argv, { maxBuffer: 8 * 1024 * 1024 });
    return stdout.trim();
  } catch (e) {
    if (allowFail) return null;
    throw new Error(`wp ${args.join(" ")} failed: ${String(e.stderr || e.message).slice(0, 400)}`);
  }
}

async function setup(fixture) {
  const url = `http://localhost:${fixture.port}`;
  // First boot: the wordpress image copies WordPress into the volume AFTER the
  // container reports started, which takes ten to thirty seconds. Every wp-cli
  // call before that ends with "This does not seem to be a WordPress
  // installation", so wait for the files rather than for the container.
  const deadline = Date.now() + 120_000;
  while ((await wp(fixture, ["core", "version"], { allowFail: true })) === null) {
    if (Date.now() > deadline) throw new Error(`${fixture.key}: WordPress files never appeared in the volume`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  const installed = await wp(fixture, ["core", "is-installed"], { allowFail: true });
  if (installed === null) {
    await wp(fixture, [
      "core", "install", `--url=${url}`, `--title=${fixture.title}`,
      "--admin_user=admin", `--admin_password=${ADMIN_PASS}`,
      "--admin_email=admin@fixture.test", "--skip-email",
    ]);
  }
  // Pretty permalinks: the default ?p=123 form hides whether our slug was
  // honoured at all, which is one of the things worth knowing here.
  await wp(fixture, ["rewrite", "structure", "/%postname%/", "--hard"]);

  if (fixture.plugin) {
    // Idempotent on purpose - this script is meant to be re-run against a
    // stack that is already up. `plugin install` errors out when the folder
    // exists, so ask first.
    const already = await wp(fixture, ["plugin", "is-installed", fixture.plugin], { allowFail: true });
    if (already === null) await wp(fixture, ["plugin", "install", fixture.plugin]);
    await wp(fixture, ["plugin", "activate", fixture.plugin]);
  }
  for (const args of fixture.afterInstall ?? []) await wp(fixture, args);

  // An Editor, not the admin: it is the role we tell owners to use, so it is
  // the role that has to work.
  await wp(fixture, [
    "user", "create", "editor", "editor@fixture.test",
    "--role=editor", `--user_pass=${EDITOR_PASS}`,
  ], { allowFail: true });

  // A fresh application password each run - WordPress shows a password once
  // and never again, exactly like the owner's own copy-paste.
  const existing = await wp(fixture, [
    "user", "application-password", "list", "editor", "--field=uuid",
  ], { allowFail: true });
  for (const uuid of (existing ?? "").split("\n").filter(Boolean)) {
    await wp(fixture, ["user", "application-password", "delete", "editor", uuid], { allowFail: true });
  }
  const password = await wp(fixture, [
    "user", "application-password", "create", "editor", "dispatchseo-e2e", "--porcelain",
  ]);
  return { url, username: "editor", applicationPassword: password };
}

/** Turn a site's REST layer off for EVERYONE, the way a locked-down site does:
 *  one must-use plugin returning a WP_Error from rest_authentication_errors.
 *  Written and removed by the test rather than left in the image, so the same
 *  fixture serves both halves of the hardened case. */
async function hardBlockRest(fixture, on) {
  const path = "/var/www/html/wp-content/mu-plugins/dispatchseo-hard-block.php";
  if (!on) {
    await wp(fixture, ["eval", `@unlink('${path}');`], { allowFail: true });
    return;
  }
  const php = "<?php add_filter('rest_authentication_errors', function () { " +
    "return new WP_Error('rest_forbidden', 'REST API access is disabled on this site.', array('status' => 403)); " +
    "}, 99);";
  await wp(fixture, [
    "eval",
    `@mkdir(dirname('${path}'), 0755, true); file_put_contents('${path}', base64_decode('${Buffer.from(php).toString("base64")}'));`,
  ]);
}

// --- a small real PNG to upload as the cover -------------------------------
// Drawn here rather than fetched from /api/cover so this script needs nothing
// running but Docker. 1x1 is enough: what is under test is the upload and the
// featured-image wiring, not the picture.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const HTML = `<h2>What this fixture proves</h2>
<p>A post created through the REST API, published by our queue rather than by WordPress's own scheduler, rendering inside whatever theme and page builder this install happens to run.</p>
<ul><li>The slug we asked for</li><li>The excerpt we sent</li><li>The featured image we uploaded</li></ul>`;

async function runFixture(publisher, fixture) {
  console.log(`\n=== ${fixture.key} (localhost:${fixture.port}) ===`);
  const creds = await setup(fixture);

  const connected = await publisher.connectWordPress(creds);

  if (fixture.mustFail) {
    // Two different sites wear the same "hardened" label, and they are not the
    // same problem.
    //
    // 1. The common one. "Disable REST API" - the most-installed plugin of its
    //    kind - blocks ANONYMOUS callers and lets authenticated ones through.
    //    We authenticate, so it does not block us. That is worth asserting
    //    rather than assuming: it means the plugin an owner most likely has
    //    installed is not a reason they cannot use this product.
    const anonymous = await fetch(`${creds.url}/wp-json/wp/v2/users/me`);
    say(fixture, anonymous.status === 401,
      "the plugin really is blocking anonymous REST", `anonymous got ${anonymous.status}`);
    say(fixture, connected.ok === true,
      "an authenticated connect still works through an anonymous-only blocker",
      connected.ok ? "" : `${connected.reason}: ${connected.message}`);

    // 2. The one that actually locks us out: a site whose REST layer refuses
    //    everyone, authenticated or not. That is what a WAF, a host-level
    //    block, or a fully locked-down security plugin looks like, and it is
    //    the exact mechanism (the rest_authentication_errors filter) they all
    //    use. Installed as a must-use plugin so nothing can deactivate it
    //    mid-test, and removed again below.
    await hardBlockRest(fixture, true);
    const blocked = await publisher.connectWordPress(creds);
    try {
      const named = ["blocked_by_security", "rest_api_not_found", "route_not_found", "auth_failed"];
      say(fixture, blocked.ok === false, "a site that refuses everyone will not connect",
        blocked.ok ? "it connected, which means the block is not in place" : "");
      if (!blocked.ok) {
        say(fixture, named.includes(blocked.reason), "the refusal has a named reason", blocked.reason);
        say(fixture, typeof blocked.message === "string" && blocked.message.length > 30 &&
          !/undefined|\[object|Error:/.test(blocked.message),
          "the owner gets a plain-English sentence, not a stack trace",
          blocked.message.slice(0, 120));
      }
    } finally {
      await hardBlockRest(fixture, false);
    }
    return;
  }

  if (!connected.ok) {
    say(fixture, false, "connect", `${connected.reason}: ${connected.message}`);
    return;
  }
  say(fixture, true, "connect", `${connected.siteName}, roles: ${connected.roles.join("/")}`);
  say(fixture, connected.capabilities.edit_posts && connected.capabilities.publish_posts,
    "an Editor can write and publish", JSON.stringify(connected.capabilities));
  say(fixture, connected.seoPlugin === (fixture.seoPlugin ?? null),
    "the SEO plugin is detected correctly", `${connected.seoPlugin}`);

  const slug = `dispatchseo-e2e-${Date.now()}`;
  const media = await publisher.uploadMedia(creds, {
    bytes: PNG_1PX, filename: `${slug}.png`, mimeType: "image/png", altText: "Fixture cover",
  });
  say(fixture, media.ok === true, "cover uploads to the media library",
    media.ok ? `id ${media.id}` : `${media.reason}: ${media.message}`);

  const created = await publisher.createPost(creds, {
    title: "A fixture article that had to survive this theme",
    html: HTML,
    slug,
    excerpt: "The excerpt doubles as the meta description for most SEO plugins.",
    categories: ["Fixtures"],
    tags: ["dispatchseo", "e2e"],
    featuredMediaId: media.ok ? media.id : undefined,
  });
  if (!created.ok) {
    say(fixture, false, "create the post", `${created.reason}: ${created.message}`);
    return;
  }
  say(fixture, created.status === "draft", "it is created as a DRAFT, never scheduled", created.status);

  const published = await publisher.publishPost(creds, created.id);
  if (!published.ok) {
    say(fixture, false, "publish", `${published.reason}: ${published.message}`);
    return;
  }
  say(fixture, published.slug === slug, "the slug we asked for is the slug we got", published.slug);

  // What the public actually sees.
  const res = await fetch(published.link, { redirect: "follow" });
  const html = await res.text();
  say(fixture, res.ok, "the published URL serves", `${res.status} ${published.link}`);
  say(fixture, html.includes("A fixture article that had to survive this theme"),
    "the title renders inside the theme's single-post template");
  say(fixture, html.includes("What this fixture proves"), "the body HTML survived");
  say(fixture, html.includes(`${slug}.png`) || html.includes("wp-post-image"),
    "the featured image is on the page");

  if (fixture.key === "elementor") {
    // The question this fixture exists for. Elementor stores its layout in
    // _elementor_data and our publisher never writes it, so a REST-created
    // post is a plain post - it has to fall through to the theme's own
    // template rather than render as an empty Elementor canvas.
    say(fixture, html.includes("What this fixture proves") && html.length > 2000,
      "an Elementor site still renders a plain REST-created post");
    const listing = await fetch(`http://localhost:${fixture.port}/`);
    const home = await listing.text();
    if (!home.includes("A fixture article that had to survive this theme")) {
      console.log("  NOTE  this Elementor install's front page does not list new posts - " +
        "an owner on an Elementor homepage may need a blog page for articles to be found");
    }
  }
}

const publisher = await loadPublisher();
for (const fixture of fixtures) {
  try {
    await runFixture(publisher, fixture);
  } catch (e) {
    failures++;
    console.log(`  FAIL  ${fixture.key} threw - ${e.message}`);
  }
}
console.log(failures === 0 ? "\nAll fixtures passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
