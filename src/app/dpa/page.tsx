import type { Metadata } from "next";
import Link from "next/link";

// The self-serve Data Processing Agreement (GDPR Art. 28).
//
// WHY IT IS PRE-ACCEPTED RATHER THAN A PDF YOU SIGN. Art. 28 needs a written
// contract, not a signed one - and a solo operation cannot run a signature
// workflow per customer without it becoming the reason customers don't have a
// DPA. Incorporating it by reference into the terms means every customer has
// one from the moment they sign up, which is the outcome the article is after.
// A countersigned copy is still available on request for procurement teams who
// need one for their file.
//
// The eight sub-paragraphs of Art. 28(3) are each covered by a section below.
// If you edit this page, keep them all: a DPA missing one of them is not a DPA.

export const metadata: Metadata = {
  title: "Data processing agreement - DispatchSEO",
  description: "The GDPR Article 28 terms under which DispatchSEO processes personal data on your behalf.",
};

const EFFECTIVE = "August 2, 2026";
const CONTACT = "privacy@dispatchseo.com";
const OPERATOR = "Neo Zino";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 text-sm leading-relaxed">
      <h2 className="text-lg font-medium text-white">{title}</h2>
      {children}
    </section>
  );
}

function Term({ children }: { children: React.ReactNode }) {
  return <strong className="text-neutral-100">{children}</strong>;
}

export default function DpaPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-6 py-16 text-neutral-300">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Data processing agreement
        </h1>
        <p className="text-sm text-neutral-500">Effective {EFFECTIVE}</p>
      </div>

      <Section title="You already have this">
        <p>
          This agreement forms part of the{" "}
          <Link className="text-white underline" href="/terms">
            terms of service
          </Link>{" "}
          and applies automatically to every customer of the hosted service - there is nothing
          to sign and nothing to request. It is the written contract required by Article 28 of
          the GDPR (and its UK equivalent) for the personal data we process on your behalf.
        </p>
        <p>
          If your procurement process needs a countersigned copy, or your own paper instead of
          ours, email{" "}
          <a className="text-white underline" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>{" "}
          and we will sort it out.
        </p>
      </Section>

      <Section title="Who is who">
        <p>
          For personal data contained in the websites, repositories and Search Console
          properties you connect - your own site visitors&apos; search queries, anything
          personal in the content we process for you - <Term>you are the controller</Term> and{" "}
          <Term>{OPERATOR} is the processor</Term>, acting on your instructions.
        </p>
        <p>
          For your own account data - your email, your billing details, your use of the product
          - we are the controller in our own right, and our{" "}
          <Link className="text-white underline" href="/privacy">
            privacy policy
          </Link>{" "}
          governs it rather than this agreement.
        </p>
      </Section>

      <Section title="What we process, and why">
        <p>
          <Term>Subject matter and duration:</Term> providing the DispatchSEO hosted service, for
          as long as your account is open.
        </p>
        <p>
          <Term>Nature and purpose:</Term> storing, organising, analysing and transmitting the
          data needed to research keywords, generate content drafts, deliver them to your
          repository, and track search performance.
        </p>
        <p>
          <Term>Types of personal data:</Term> identifiers and contact details of your account
          users; search queries and performance statistics from your Search Console properties;
          repository and site metadata; and whatever personal data happens to appear in content
          or site material you connect.
        </p>
        <p>
          <Term>Categories of data subjects:</Term> your personnel who use the service, and
          visitors to your websites insofar as their search behaviour appears in aggregated
          Search Console statistics. We do not need or want special-category data, and the
          service is not built to handle it.
        </p>
      </Section>

      <Section title="Our obligations">
        <p>
          <Term>We process only on your documented instructions</Term>, which are these terms
          and your use of the product&apos;s features, including for international transfers -
          unless the law requires otherwise, in which case we will tell you first unless that
          law forbids it. If we think an instruction breaches data protection law, we will say
          so.
        </p>
        <p>
          <Term>Confidentiality.</Term> Anyone authorised to process the data is bound by a
          duty of confidentiality.
        </p>
        <p>
          <Term>Security.</Term> We maintain the technical and organisational measures required
          by Article 32, described in the Security section of our{" "}
          <Link className="text-white underline" href="/privacy">
            privacy policy
          </Link>{" "}
          - encryption in transit and of stored credentials, default-deny database access, and
          hashed authentication secrets.
        </p>
        <p>
          <Term>Subprocessors.</Term> You give general authorisation for us to engage the
          subprocessors listed at{" "}
          <Link className="text-white underline" href="/subprocessors">
            /subprocessors
          </Link>
          . We impose the same data-protection obligations on each of them and remain fully
          liable to you for their performance. We will give at least 30 days&apos; notice before
          adding or replacing one; if you reasonably object on data-protection grounds and we
          cannot resolve it, you may terminate and we will refund the unused portion of your
          period.
        </p>
        <p>
          <Term>Helping you with data subjects.</Term> Taking into account the nature of the
          processing, we will help you respond to requests to access, correct, delete, restrict,
          port or object - largely through the product&apos;s own controls, which let you reach
          and delete this data yourself. If a data subject contacts us directly, we will
          redirect them to you rather than answer for you.
        </p>
        <p>
          <Term>Breaches and assessments.</Term> We will notify you without undue delay after
          becoming aware of a personal data breach affecting your data, with the detail you need
          for your own notification duties, and will give reasonable assistance with data
          protection impact assessments and prior consultations.
        </p>
        <p>
          <Term>Return or deletion.</Term> On termination we delete your data as described in
          the privacy policy - deleting your account erases your projects and their history
          immediately - unless the law requires us to keep something. You can export your data
          from the product before you go, and we will help if you ask.
        </p>
        <p>
          <Term>Information and audits.</Term> We will make available the information needed to
          show we comply with this agreement, and allow and contribute to audits by you or an
          auditor you appoint, on reasonable notice, no more than once a year unless a breach or
          a regulator makes another one necessary, at your cost and without disrupting the
          service or exposing another customer&apos;s data.
        </p>
      </Section>

      <Section title="International transfers">
        <p>
          We are established in Israel, which the European Commission recognises as providing an
          adequate level of protection, so transfers from the EEA to us need no additional
          safeguard. Where a subprocessor is outside the EEA or the UK, the transfer is covered
          by the European Commission&apos;s Standard Contractual Clauses (or the UK Addendum or
          International Data Transfer Agreement, as applicable), which are incorporated into
          this agreement by reference and prevail over anything inconsistent with them. The{" "}
          <Link className="text-white underline" href="/subprocessors">
            subprocessors page
          </Link>{" "}
          names the mechanism for each.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          Liability under this agreement is subject to the limitations in the{" "}
          <Link className="text-white underline" href="/terms">
            terms of service
          </Link>
          , except where data protection law does not permit that - nothing here limits either
          party&apos;s liability to a data subject or a supervisory authority.
        </p>
      </Section>

      <p className="text-sm text-neutral-500">
        <Link className="underline" href="/">
          Back to dispatchseo.com
        </Link>
      </p>
    </main>
  );
}
