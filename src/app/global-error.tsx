"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// The last net. app/error.tsx catches anything thrown INSIDE the root layout's
// children; this catches the root layout itself failing, which is the one
// crash that leaves the user staring at a blank document.
//
// Because it renders IN PLACE of the root layout, globals.css never loads -
// hence inline styles rather than the Tailwind classes used everywhere else.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#f5f5f5",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>DispatchSEO failed to load</h2>
          <p style={{ fontSize: "0.875rem", color: "#a3a3a3", lineHeight: 1.6 }}>
            This is a page-rendering error - your crons, keywords and queued suggestions are
            untouched. Reload the page; if it keeps happening, the reference below identifies
            this exact failure.
          </p>
          <p
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: "0.75rem",
              color: "#737373",
              background: "#050505",
              borderRadius: "0.25rem",
              padding: "0.5rem 0.75rem",
            }}
          >
            {error.digest ? `digest ${error.digest}` : error.message || "unknown error"}
          </p>
          <a
            href="/"
            style={{
              display: "inline-block",
              background: "#ffffff",
              color: "#0a0a0a",
              borderRadius: "0.5rem",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Reload
          </a>
        </div>
      </body>
    </html>
  );
}
