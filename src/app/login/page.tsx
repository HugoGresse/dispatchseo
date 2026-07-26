import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { COOKIE_NAME, cookieSecure, cookieValue, isCorrectPassword } from "@/lib/dashboard-auth";
import { getSetupState } from "@/lib/setup";
import { isCloudMode } from "@/lib/cloud";
import { supabaseAuth } from "@/lib/cloud-auth";
import { REPO_SLUG } from "@/lib/repo-notice";
import {
  clearLoginFailures,
  clientIp,
  loginLockedUntil,
  recordLoginFailure,
} from "@/lib/login-lockout";
import { DispatchMark } from "@/components/logo";
import { AuthDivider, GoogleSignInButton } from "@/components/google-signin";
import { AuthShell } from "@/components/auth-shell";
import { FormPending } from "@/components/dispatching";

async function login(formData: FormData) {
  "use server";
  const h = await headers();
  const ip = clientIp(h);
  if (await loginLockedUntil(ip)) {
    redirect("/login?error=locked");
  }
  const attempt = String(formData.get("password") ?? "");
  if (!(await isCorrectPassword(attempt))) {
    const locked = await recordLoginFailure(ip);
    redirect(locked ? "/login?error=locked" : "/login?error=1");
  }
  await clearLoginFailures(ip);
  const jar = await cookies();
  jar.set(COOKIE_NAME, await cookieValue(), {
    httpOnly: true,
    secure: cookieSecure(h),
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  redirect("/dashboard");
}

// CLOUD_MODE sign-in: a real account, not the shared password. Supabase
// enforces its own per-IP rate limits on auth endpoints, so the self-host
// login-lockout table isn't consulted here.
async function cloudLogin(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/login?error=1");
  const supabase = await supabaseAuth();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=1");
  redirect("/dashboard");
}

const inputCls =
  "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-400";

function CloudLoginPage({
  error,
  reset,
  leftover,
}: {
  error?: string;
  reset?: string;
  leftover?: string;
}) {
  // Repos whose pipeline teardown didn't finish during account deletion. The
  // account is gone, so this screen is the last chance to tell them something
  // of theirs is still scheduled - saying nothing would leave them getting
  // failure emails from a product they no longer have.
  //
  // Filtered to owner/repo shape because this page is UNAUTHENTICATED and the
  // value is a plain query param: anyone can link to /login?leftover=... and
  // without this, that is a free "make dispatchseo.com say arbitrary alarming
  // text" primitive. Constrained to repo slugs it stops being a message
  // channel. React escapes the output either way, so this is about the
  // phishing pretext, not injection.
  const matched = (leftover ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter((r) => REPO_SLUG.test(r));
  const stranded = matched.slice(0, 5);
  const strandedExtra = matched.length - stranded.length;
  return (
    <AuthShell>
      <h1 className="text-xl font-semibold text-white">
        <Link href="/" className="flex items-center gap-2.5">
          <DispatchMark className="h-7 w-auto" />
          DispatchSEO
        </Link>
      </h1>
      {stranded.length > 0 ? (
        <div className="space-y-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200/90">
          <p className="leading-relaxed">
            Your account is deleted. We couldn&apos;t remove our workflows from{" "}
            {matched.length === 1 ? "one repo" : `${matched.length} repos`} — disable the{" "}
            <span className="font-mono text-xs">seo-*</span> workflows there or they&apos;ll keep
            failing:
          </p>
          <ul className="space-y-0.5">
            {stranded.map((repo) => (
              <li key={repo}>
                <a
                  href={`https://github.com/${repo}/actions`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-amber-200 underline underline-offset-2 hover:text-amber-100"
                >
                  {repo}
                </a>
              </li>
            ))}
            {strandedExtra > 0 ? (
              <li className="text-xs text-amber-200/70">and {strandedExtra} more</li>
            ) : null}
          </ul>
        </div>
      ) : null}
      {reset ? (
        <p className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-400">
          Password updated - sign in with your new password.
        </p>
      ) : null}
      <GoogleSignInButton label="Continue with Google" />
      <AuthDivider />
      <form action={cloudLogin} className="space-y-4">
        <FormPending label="Signing you in" />
        <input type="email" name="email" placeholder="Email" className={inputCls} />
        <input type="password" name="password" placeholder="Password" className={inputCls} />
        <div className="-mt-1 flex justify-end">
          <Link
            href="/forgot-password"
            className="text-xs text-neutral-500 hover:text-neutral-300"
          >
            Forgot password?
          </Link>
        </div>
        {error ? <p className="text-sm text-red-400">Sign-in failed - check the email and password.</p> : null}
        <button
          type="submit"
          className="w-full rounded-lg bg-white px-4 py-3 font-medium text-neutral-950"
        >
          Sign in
        </button>
      </form>
      <p className="text-sm text-neutral-500">
        New here?{" "}
        <Link href="/signup" className="text-neutral-300 underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string; leftover?: string }>;
}) {
  const { error, reset, leftover } = await searchParams;
  if (isCloudMode()) return <CloudLoginPage error={error} reset={reset} leftover={leftover} />;
  // A fresh deploy has nothing to log into yet - hand off to the wizard.
  if ((await getSetupState()) !== "ready") redirect("/setup");
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-950 p-6">
      <form action={login} className="w-full max-w-xs space-y-4">
        <FormPending label="Signing you in" />
        <h1 className="flex items-center gap-2.5 text-xl font-semibold text-white">
          <DispatchMark className="h-7 w-auto" />
          DispatchSEO
        </h1>
        <input
          type="password"
          name="password"
          placeholder="Password"
          autoFocus
          className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-400"
        />
        {error === "locked" ? (
          <p className="text-sm text-red-400">
            Too many attempts. Locked for 15 minutes.
          </p>
        ) : error ? (
          <p className="text-sm text-red-400">Wrong password.</p>
        ) : null}
        <button
          type="submit"
          className="w-full rounded-lg bg-white px-4 py-3 font-medium text-neutral-950"
        >
          Enter
        </button>
      </form>
    </main>
  );
}
