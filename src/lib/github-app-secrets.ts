import sodium from "libsodium-wrappers";
import { installationToken } from "./github-app";

// GitHub Actions repo secrets, written through the App installation token.
// GitHub's secrets API requires the plaintext sealed (libsodium crypto_box_seal)
// with the repo's public key - this module is the only place that dance lives.
// Server-only: values pass through here in plaintext for the duration of the
// request and are never persisted on our side.

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
  if (!project.github_installation_id) return { ok: false, error: "GitHub App not installed" };
  let token: string;
  try {
    token = await installationToken(project.github_installation_id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
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
  if (!project.github_repo || !project.github_installation_id) {
    throw new Error("no App-connected repo to check");
  }
  const token = await installationToken(project.github_installation_id);
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
