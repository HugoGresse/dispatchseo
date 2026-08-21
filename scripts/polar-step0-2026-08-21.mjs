#!/usr/bin/env node
// One-off for 2026-08-21 "step 0" - run it yourself from the repo root:
//
//   node --env-file=.env.local scripts/polar-step0-2026-08-21.mjs
//
// What it does, in order, printing each result:
//   1. Reprices the three live Polar products to $29 / $59 / $99 a month
//      (existing subscribers keep the price they signed up at).
//   2. Creates the three yearly products ($240 / $480 / $828 a year; Starter
//      keeps the 7-day trial like its monthly twin) and prints their ids.
//   3. Writes POLAR_PRODUCT_*_ANNUAL to Vercel (production + preview) with
//      the Vercel CLI, and removes POLAR_FOUNDING_DISCOUNT_ID.
//   4. Deletes the founding discount (if the token can see it).
//   5. Revokes the two $0 test subscriptions (zinops2@, neozino.dev@).
// It never touches the real trial (morganmilstone983@). Safe to re-run: each
// step checks before it writes. Delete this file afterwards - it is not part
// of the product.

import { execFileSync } from "node:child_process";

const TOK = process.env.POLAR_ACCESS_TOKEN;
if (!TOK) throw new Error("POLAR_ACCESS_TOKEN missing - run with --env-file=.env.local");
const BASE = "https://api.polar.sh/v1";

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${TOK}`, "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "follow",
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, json, text };
}

const MONTHLY = {
  Starter: { id: "874d2e09-4b7d-4f4c-b648-1a6e869dabb8", amount: 2900 },
  Growth: { id: "81d85452-523b-419b-8cfa-eca5d4a6b0e4", amount: 5900 },
  Scale: { id: "656da06b-8713-4ad8-96e8-a52656197db5", amount: 9900 },
};

const YEARLY = [
  { env: "POLAR_PRODUCT_STARTER_ANNUAL", name: "Starter (yearly)", amount: 24000, trial: true,
    description: "1 site on autopilot, billed once a year ($20/mo): keyword research, one article a day shipped as a pull request you review, daily rank tracking. Content is written by your own agent." },
  { env: "POLAR_PRODUCT_GROWTH_ANNUAL", name: "Growth (yearly)", amount: 48000, trial: false,
    description: "Up to 3 sites on autopilot, billed once a year ($40/mo). Content is written by your own agent." },
  { env: "POLAR_PRODUCT_SCALE_ANNUAL", name: "Scale (yearly)", amount: 82800, trial: false,
    description: "Up to 5 sites on autopilot, billed once a year ($69/mo). Content is written by your own agent." },
];

const TEST_SUBS = [
  { id: "668d4169-fd60-497c-9e37-40a25b86eb85", email: "zinops2@gmail.com" },
  { id: "63677c57-5604-4b82-97fc-ffec619fff32", email: "neozino.dev@gmail.com" },
];

console.log("\n== 1. Reprice monthly products ==");
for (const [name, { id, amount }] of Object.entries(MONTHLY)) {
  const cur = await call("GET", `/products/${id}`);
  const live = (cur.json?.prices ?? []).filter((p) => !p.is_archived).map((p) => p.price_amount);
  if (live.length === 1 && live[0] === amount) { console.log(`  ${name}: already $${amount / 100}/mo - skip`); continue; }
  const r = await call("PATCH", `/products/${id}`, {
    prices: [{ amount_type: "fixed", price_currency: "usd", price_amount: amount }],
  });
  if (r.status === 200) {
    const now = r.json.prices.filter((p) => !p.is_archived).map((p) => p.price_amount / 100);
    console.log(`  ${name}: ${live.map((a) => a / 100)} -> $${now}/mo  OK`);
  } else console.log(`  ${name}: FAILED ${r.status} ${r.text.slice(0, 300)}`);
}

console.log("\n== 2. Yearly products ==");
const existing = await call("GET", "/products/?limit=50&is_archived=false");
const byName = new Map((existing.json?.items ?? []).map((p) => [p.name, p]));
const ids = {};
for (const y of YEARLY) {
  const have = byName.get(y.name);
  if (have) { ids[y.env] = have.id; console.log(`  ${y.name}: exists ${have.id} - skip`); continue; }
  const body = {
    name: y.name, description: y.description, recurring_interval: "year",
    prices: [{ amount_type: "fixed", price_currency: "usd", price_amount: y.amount }],
    ...(y.trial ? { trial_interval: "week", trial_interval_count: 1 } : {}),
  };
  const r = await call("POST", "/products/", body);
  if (r.status === 200 || r.status === 201) { ids[y.env] = r.json.id; console.log(`  ${y.name}: created ${r.json.id} ($${y.amount / 100}/yr${y.trial ? ", 7-day trial" : ""})`); }
  else console.log(`  ${y.name}: FAILED ${r.status} ${r.text.slice(0, 300)}`);
}

console.log("\n== 3. Vercel env ==");
for (const [env, id] of Object.entries(ids)) {
  for (const target of ["production", "preview"]) {
    try {
      execFileSync("vercel", ["env", "rm", env, target, "-y"], { stdio: "ignore" });
    } catch { /* did not exist */ }
    try {
      execFileSync("vercel", ["env", "add", env, target], { input: id, stdio: ["pipe", "ignore", "inherit"] });
      console.log(`  ${env} (${target}) = ${id}  OK`);
    } catch (e) { console.log(`  ${env} (${target}) FAILED: ${e.message}`); }
  }
}
for (const target of ["production", "preview"]) {
  try { execFileSync("vercel", ["env", "rm", "POLAR_FOUNDING_DISCOUNT_ID", target, "-y"], { stdio: "ignore" }); console.log(`  removed POLAR_FOUNDING_DISCOUNT_ID (${target})`); }
  catch { console.log(`  POLAR_FOUNDING_DISCOUNT_ID (${target}) not present`); }
}

console.log("\n== 4. Founding discount ==");
const org = MONTHLY.Starter && (await call("GET", `/products/${MONTHLY.Starter.id}`)).json?.organization_id;
const disc = await call("GET", `/discounts/?limit=50${org ? `&organization_id=${org}` : ""}`);
const found = (disc.json?.items ?? []).filter((d) => d.type === "percentage" && d.basis_points === 5000);
if (!found.length) console.log("  no 50% discount visible to this token - archive it in the Polar dashboard (Discounts) if it still exists");
for (const d of found) {
  const r = await call("DELETE", `/discounts/${d.id}`);
  console.log(`  ${d.name} (${d.id}): ${r.status === 204 || r.status === 200 ? "deleted" : `FAILED ${r.status} ${r.text.slice(0, 200)}`}`);
}

console.log("\n== 5. Test subscriptions ==");
for (const s of TEST_SUBS) {
  const cur = await call("GET", `/subscriptions/${s.id}`);
  if (!cur.json || ["canceled", "revoked"].includes(cur.json.status)) { console.log(`  ${s.email}: already ${cur.json?.status ?? "gone"}`); continue; }
  const r = await call("DELETE", `/subscriptions/${s.id}`);
  console.log(`  ${s.email}: ${r.status === 200 || r.status === 204 ? "revoked" : `FAILED ${r.status} ${r.text.slice(0, 200)}`}`);
}

console.log("\nDone. Next: tell Claude \"push\" (the yearly toggle appears once all three _ANNUAL envs are set and the new deploy is live).\n");
