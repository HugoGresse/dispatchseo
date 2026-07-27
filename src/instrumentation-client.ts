import posthog from "posthog-js";

// Self-host installs leave the token unset - posthog-js has no way to no-op
// itself, so skip init entirely rather than call it with an empty token.
if (process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    defaults: "2026-05-30",
  });
}
