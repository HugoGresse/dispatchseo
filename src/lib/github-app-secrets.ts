import sodium from "libsodium-wrappers";
import { installationToken } from "./github-app";
import { isCloudMode } from "./cloud";

// GitHub Actions repo secrets - written through the App installation token in
// cloud, or the instance's stored PAT (the wizard's one-tap-merge token, repo
// scope) on self-host, which the secrets API accepts just the same. The PAT
// path exists because a self-host has no App, and "the backend can't copy the
// token across" turned a credential pasted in the wizard into a 9-second
// workflow failure that emailed the owner (2026-08-02, first outside install).
// GitHub's secrets API requires the plaintext sealed (libsodium crypto_box_seal)
// with the repo's public key - this module is the only place that dance lives.
// Server-only: values pass through here in plaintext for the duration of the
// request and are never persisted on our side.

// Which credential can touch this repo's secrets. Never a shared/operator
// token for a cloud tenant: without an App installation there, the honest
// answer is "none" - the same tenant boundary connectBuilderToken enforces.
async function repoToken(project: {
  github_repo: string | null;
  github_installation_id: number | null;
}): Promise<string | null> {
  if (project.github_installation_id) {
    try {
      return await installationToken(project.github_installation_id);
    } catch {
      return null;
    }
  }
  if (isCloudMode()) return null;
  const { tokenForRef } = await import("./github");
  return tokenForRef(project);
}

async function sealedBox(plaintext: string, repoPublicKeyB64: string): Promise<string> {
  await sodium.ready;
  const key = sodium.from_base64(repoPublicKeyB64, sodium.base64_variants.ORIGINAL);
  const sealed = sodium.crypto_box_seal(sodium.from_string(plaintext), key);
  return sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);
}

const GH = "https://api.github.com";

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "dispatchseo-app",
  };
}

export async function setRepoSecret(
  project: { github_repo: string | null; github_installation_id: number | null },
  name: string,
  value: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!project.github_repo) return { ok: false, error: "no repo connected" };
  const token = await repoToken(project);
  if (!token) {
    return {
      ok: false,
      error: project.github_installation_id
        ? "could not get an App installation token"
        : "no GitHub credential for this repo (no App installation, no stored token)",
    };
  }
  let keyRes: Response;
  try {
    keyRes = await fetch(`${GH}/repos/${project.github_repo}/actions/secrets/public-key`, {
      headers: headers(token),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return { ok: false, error: "could not reach GitHub" };
  }
  if (!keyRes.ok) return { ok: false, error: `public key fetch failed: HTTP ${keyRes.status}` };
  const { key, key_id } = (await keyRes.json()) as { key: string; key_id: string };
  let res: Response;
  try {
    res = await fetch(`${GH}/repos/${project.github_repo}/actions/secrets/${name}`, {
      method: "PUT",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ encrypted_value: await sealedBox(value, key), key_id }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return { ok: false, error: "could not reach GitHub" };
  }
  return res.ok ? { ok: true } : { ok: false, error: `secret write failed: HTTP ${res.status}` };
}

// Existence probe with an honest third answer: GitHub answering 404 is FALSE,
// GitHub answering 200 is TRUE, and anything that prevented asking at all -
// missing App credentials (a self-host or local env without GITHUB_APP_*),
// a failed installation token, a 403, a network error - THROWS. The
// distinction is load-bearing for any caller that renders "needs key" off a
// false: an instance that cannot reach the App sees false for every secret
// that exists, and told the owner to re-paste keys they already stored.
// (No values ever come back from GitHub's secrets API - existence only.)
export async function checkRepoSecret(
  project: { github_repo: string | null; github_installation_id: number | null },
  name: string,
): Promise<boolean> {
  if (!project.github_repo) throw new Error("no repo to check");
  const token = await repoToken(project);
  if (!token) throw new Error("no GitHub credential to check with");
  const res = await fetch(`${GH}/repos/${project.github_repo}/actions/secrets/${name}`, {
    headers: headers(token),
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`secret check failed: HTTP ${res.status}`);
  return true;
}

// Fail-closed convenience over checkRepoSecret - "couldn't ask" collapses to
// false. Right for gates where the safe default is "treat as absent" (the
// pipeline installer holding the setup dispatch until the token is pasted);
// wrong for anything user-facing that says "needs key" - use checkRepoSecret
// there and render the failure as unknown instead.
export async function hasRepoSecret(
  project: { github_repo: string | null; github_installation_id: number | null },
  name: string,
): Promise<boolean> {
  try {
    return await checkRepoSecret(project, name);
  } catch {
    return false;
  }
}
