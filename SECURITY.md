# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's
[private vulnerability reporting](../../security/advisories/new)
("Report a vulnerability" under the repo's Security tab). Do not open a
public issue for anything exploitable.

You'll get an acknowledgment within a few days. This is a solo-maintained
project - fixes for real vulnerabilities are prioritized over everything
else, but there is no bug-bounty program.

## Supported versions

Only the latest `main` is supported. There are no release branches; deploy
from `main` and pull updates regularly.

## The security model (what's worth knowing before reporting)

The same codebase runs in **two modes**, and which one you're looking at
decides what counts as a vulnerability. The switch is `CLOUD_MODE`
(`src/lib/cloud.ts`), read per-request and never at module scope.

**Self-hosted (the default, `CLOUD_MODE` unset)** is a single-owner app: no
user model, no signup, no roles. One person owns every project in the
deployment.

- **Dashboard**: one password gates every page (`DASHBOARD_PASSWORD`, or the
  hash chosen in the setup wizard). The session cookie is an HMAC keyed by
  that secret, so rotating it invalidates all sessions. Login is rate-limited
  (5 failed attempts per IP = 15-minute lockout).

**Hosted cloud (`dispatchseo.com`, `CLOUD_MODE=true`)** is genuinely
multi-tenant: Supabase Auth accounts, per-account subscriptions, and many
customers' projects in one database.

- **Dashboard**: Supabase Auth session (email/password or Google), checked
  through the central gate in `src/lib/auth-gate.ts`. There is no shared
  password.
- **Tenant isolation is a real boundary here.** Every project row carries an
  `owner_user_id`, and actions that take a project or row id assert ownership
  via `src/lib/tenant-guard.ts` before touching anything.
  **Cross-tenant reads AND writes are in scope and we want those reports** -
  including subtler ones than data reads, e.g. one tenant clearing another's
  alerts or influencing their scheduled work.

Boundaries shared by both modes:

- **MCP server** (`/api/mcp`): per-project 192-bit bearer tokens. A token IS
  the tenant - it can only touch its own project's rows, and must never
  reveal another project's existence.
- **Crons** (`/api/cron/*`): a shared `CRON_SECRET` bearer token.
- **Database**: server code holds full read/write and it never reaches the
  browser - server-only modules (`src/lib/db.ts` and friends) are kept out of
  client bundles by design. On the **hosted/cloud** deployment the store is
  Supabase with RLS enabled and zero policies, gated by the service-role key -
  so isolation is enforced in application code, not by RLS, which is exactly
  why the tenant-guard assertions matter. On a **self-hosted Docker** stack
  it's the bundled Postgres + PostgREST, reachable only on the stack's
  internal Docker network (never exposed to the host) - no Supabase and no
  service-role key involved.

Out of scope: multi-user findings against a **self-hosted** deployment
("user A can see user B's data") - there really is only one user there. The
same finding against the hosted cloud is in scope and worth reporting.

## Notes for self-hosters

- Use a **long, random `DASHBOARD_PASSWORD`** - it is the only thing between
  the internet and your dashboard.
- Never commit `.env.local`; the example file is the only env file that
  belongs in git.
- Treat your secrets as equal-weight full access to their surface. On a
  **Docker** stack that's `POSTGRES_PASSWORD` (set it before first boot),
  `MCP_API_KEY` / per-project MCP tokens, and `CRON_SECRET`; a from-source
  deploy uses `SUPABASE_SERVICE_ROLE_KEY` in place of `POSTGRES_PASSWORD`.
- Optional but recommended: add a rate-limit rule on `POST /login` in your
  host's firewall (free on Vercel Hobby) as a second layer in front of the
  built-in lockout.
