"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AI_OPTIONS } from "@/lib/qualifier-options";
import { submitQualifier, type QualifyState } from "./actions";

// Client half of /qualify. Two fields, one answer. The answer is either a
// green "you're set" with a link to the plans, or a plain statement of what
// we can't do - never a form asking for their email so we can "let them know",
// because a waitlist for a thing we might not build is the same lie as a
// checkout that can't finish.

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 animate-spin">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function QualifyForm() {
  const [state, action, pending] = useActionState<QualifyState, FormData>(submitQualifier, null);

  return (
    <>
      <form action={action} className="mt-8 space-y-6">
        <div>
          <label htmlFor="domain" className="block text-sm font-medium text-neutral-200">
            What&apos;s your website address?
          </label>
          <p className="mt-1 text-[13px] text-neutral-500">
            We&apos;ll load the page once to see what it&apos;s built with. Nothing is changed.
          </p>
          <input
            id="domain"
            name="domain"
            type="text"
            required
            autoComplete="url"
            spellCheck={false}
            defaultValue={state?.domain ?? ""}
            placeholder="yoursite.com"
            className="mt-2.5 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 py-2.5 text-[15px] text-neutral-100 placeholder:text-neutral-600 focus:border-violet-500/60 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
          />
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-neutral-200">Which AI do you use?</legend>
          <p className="mt-1 text-[13px] text-neutral-500">
            DispatchSEO drives your AI. It doesn&apos;t come with one.
          </p>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {AI_OPTIONS.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 py-2.5 transition-colors hover:border-neutral-700 has-[:checked]:border-violet-500/60 has-[:checked]:bg-violet-500/10"
              >
                <input
                  type="radio"
                  name="ai"
                  value={o.value}
                  required
                  defaultChecked={state?.ai === o.value}
                  className="mt-1 h-3.5 w-3.5 shrink-0 accent-violet-500"
                />
                <span>
                  <span className="block text-sm font-medium text-neutral-100">{o.label}</span>
                  <span className="block text-[12px] leading-snug text-neutral-500">{o.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {pending ? (
            <>
              <Spinner />
              Checking your site
            </>
          ) : (
            "Check my site"
          )}
        </button>
      </form>

      {state?.error ? (
        <p className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-sm text-red-200">
          {state.error}
        </p>
      ) : null}

      {state?.verdict ? (
        <div
          className={`mt-6 rounded-2xl border px-4 py-4 ${
            state.verdict.ok
              ? "border-emerald-500/30 bg-emerald-500/10"
              : state.verdict.building
                ? "border-amber-500/30 bg-amber-500/10"
                : "border-neutral-700 bg-neutral-900"
          }`}
        >
          <p
            className={`text-[15px] font-semibold ${
              state.verdict.ok ? "text-emerald-200" : state.verdict.building ? "text-amber-200" : "text-neutral-100"
            }`}
          >
            {state.verdict.headline}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-300">{state.verdict.detail}</p>

          {state.detected ? (
            <p className="mt-3 text-[12px] text-neutral-500">
              We saw: {state.detected}
              {state.verdict.ok ? null : " — if that's wrong, reply to your signup email and tell me."}
            </p>
          ) : null}

          {state.verdict.ok ? (
            <Link
              href="/plans"
              className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400"
            >
              See the plans
              <span aria-hidden="true">&rarr;</span>
            </Link>
          ) : (
            <p className="mt-4 text-[13px] text-neutral-400">
              Nothing has been charged. You can change your answers above and check again.
            </p>
          )}
        </div>
      ) : null}
    </>
  );
}
