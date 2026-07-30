import Link from "next/link";
import { MascotFace } from "@/components/mascot-face";

// The Dispatcher's aside on the signup form: what a site needs before any of
// this can work, said BEFORE an account exists and long before a card does.
//
// Why it lives here and not in AuthShell: the shell is shared with /login, and
// a person signing back in has already been through setup. The notice belongs
// on the one screen where someone is about to start.
//
// Why it is static copy rather than a per-domain check: the signup page never
// asks for a domain. `?domain=` only arrives when the visitor used the landing
// hero's box, and the field on this page is a hidden input carrying that value
// (see signup/page.tsx) - so a person who clicked "Start for free" reaches
// checkout without ever naming their site. A stack sniffer would have nothing
// to sniff for exactly the people who most need telling. This is the honest
// version: state the requirement, name the platforms it rules out, link the
// long form.
//
// Amber, not red, on the same reasoning as the "address already has an
// account" notice below it: the reader has done nothing wrong. They are being
// handed a fact early enough to act on it.
//
// The requirement list is deliberately BOTH hard gates, not just the repo one.
// The wizard refuses to finish without a repo (pipeline-install.ts) AND
// without a Claude Code token (screen c2 has no skip). Naming one and hiding
// the other just moves the surprise one screen later.
export function SignupRequirements() {
  return (
    <div className="flex items-start gap-2.5">
      <MascotFace className="mt-1.5 h-8 w-[42px] shrink-0" />
      <div className="relative rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3">
        {/* The tail. A rotated square sharing the bubble's fill, with only the
            two edges that face the mascot keeping their border, so it reads as
            a continuation of the outline rather than a diamond stuck to it. */}
        <span
          aria-hidden="true"
          className="absolute -left-[5px] top-4 h-2.5 w-2.5 rotate-45 border-b border-l border-amber-500/25 bg-amber-500/10"
        />
        <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-amber-300/90">
          psst
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-amber-200/90">
          DispatchSEO publishes by opening pull requests on your site&apos;s code, so your site
          needs to live in a GitHub repo. If it runs on WordPress, Wix, Squarespace, or Shopify,
          this will not work for you yet. You will also need a Claude subscription with Claude
          Code.
        </p>
        <Link
          href="/docs/setup-wizard"
          className="mt-1.5 inline-block text-[13px] font-medium text-amber-200 underline underline-offset-2 hover:text-white"
        >
          See what you need
        </Link>
      </div>
    </div>
  );
}
