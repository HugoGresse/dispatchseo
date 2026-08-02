"use client";

import { useState } from "react";
import Link from "next/link";

// Clickwrap acceptance for account creation.
//
// WHY A CHECKBOX AND NOT A SENTENCE. This page used to say "By signing up, you
// agree to our terms" under the button - a sign-in-wrap. Courts enforce those
// inconsistently, and everything the terms of service do for us (the liability
// cap, the indemnity, the AI-output disclaimers) only exists if the contract
// formed in the first place. An affirmative tick, recorded on both signup
// paths, is the cheapest way to stop that being arguable.
//
// It gates BOTH paths deliberately. The Google button is a separate <form>
// posting to its own server action, so a checkbox living only in the email form
// would leave OAuth signups with no recorded acceptance at all - which is the
// path most people take.
//
// The checkbox belongs to the email form via the HTML `form` attribute rather
// than by sitting inside it, so one tick covers both buttons and the browser
// still enforces `required` on submit. Both server actions re-check it; the
// disabled button is UX, not the control.
export function SignupConsent({
  formId,
  googleAction,
  domain,
}: {
  formId: string;
  googleAction: (formData: FormData) => void | Promise<void>;
  domain?: string | null;
}) {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-neutral-400">
        <input
          type="checkbox"
          name="accept"
          value="yes"
          form={formId}
          required
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-violet-500"
        />
        <span>
          I agree to the{" "}
          <Link
            href="/terms"
            className="text-neutral-200 underline underline-offset-2 hover:text-white"
          >
            terms of service
          </Link>{" "}
          and the{" "}
          <Link
            href="/privacy"
            className="text-neutral-200 underline underline-offset-2 hover:text-white"
          >
            privacy policy
          </Link>
          .
        </span>
      </label>

      <form action={googleAction}>
        {domain ? <input type="hidden" name="domain" value={domain} /> : null}
        {/* Tells the shared google action that this is the SIGNUP leg, so it
            enforces acceptance. The same action serves /login, where there is
            no box to tick and nothing to accept. */}
        <input type="hidden" name="mode" value="signup" />
        <input type="hidden" name="accept" value={accepted ? "yes" : ""} />
        <button
          type="submit"
          disabled={!accepted}
          className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 font-medium text-white transition-colors hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-700"
        >
          <GoogleG />
          Sign up with Google
        </button>
      </form>
    </div>
  );
}

// Duplicated from google-signin.tsx rather than imported: that module is a
// server component and pulling it into this client boundary would drag the
// server action wiring with it.
function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.27a12 12 0 0 0 0 10.78l4.01-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.61l4.01 3.1C6.22 6.87 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}
