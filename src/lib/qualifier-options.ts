// The AI options the qualifier offers, in its own module and deliberately so:
// the /qualify form is a client component and renders this list, while the
// server action validates against it. Living in qualifier.ts would have pulled
// that file - and through it db.ts and the service-role key - straight into
// the browser bundle. Same reasoning as cancellation-reasons.ts.
//
// Nothing here may import anything server-only, ever.

export type AiChoice =
  | "claude-code"
  | "codex"
  | "cursor"
  | "chatgpt"
  | "claude-web"
  | "gemini"
  | "none";

export const AI_OPTIONS: { value: AiChoice; label: string; hint: string }[] = [
  { value: "claude-code", label: "Claude Code", hint: "Anthropic's terminal agent" },
  { value: "codex", label: "Codex", hint: "OpenAI's coding agent" },
  { value: "cursor", label: "Cursor", hint: "the agent inside the editor" },
  { value: "chatgpt", label: "ChatGPT", hint: "the normal chat app, paid plan" },
  { value: "claude-web", label: "Claude", hint: "the normal chat app, paid plan" },
  { value: "gemini", label: "Gemini", hint: "Google's chat app" },
  { value: "none", label: "None of these", hint: "I don't use an AI assistant" },
];

export const AI_VALUES = AI_OPTIONS.map((o) => o.value);

export function isAiChoice(value: string): value is AiChoice {
  return (AI_VALUES as string[]).includes(value);
}
