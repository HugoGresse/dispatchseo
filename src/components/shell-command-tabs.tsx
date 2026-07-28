"use client";

import { useEffect, useState } from "react";
import { CopyBox } from "./wizard-ui";
import { CopyBlock } from "./client";

// A user-pasted terminal command in both shells: bash (Mac/Linux) and
// PowerShell (the default Windows terminal - the first Windows e2e died
// pasting a bash chain into it). Tabs with one visible box; the visitor's
// own OS picks the default tab after mount, because the server can't know
// the OS and guessing there would be a hydration mismatch.
export function ShellCommandTabs({
  bash,
  powershell,
  box = "wizard",
}: {
  bash: string;
  powershell: string;
  // Which copy widget to render: the wizard's CopyBox or the dashboard
  // cards' dashed CopyBlock, so the tabs blend into either surface.
  box?: "wizard" | "card";
}) {
  const [shell, setShell] = useState<"bash" | "powershell">("bash");
  useEffect(() => {
    if (navigator.userAgent.includes("Windows")) setShell("powershell");
  }, []);
  const text = shell === "bash" ? bash : powershell;
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1" role="tablist" aria-label="Shell">
        {(
          [
            ["bash", "Mac / Linux"],
            ["powershell", "Windows (PowerShell)"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={shell === key}
            onClick={() => setShell(key)}
            className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              shell === key
                ? "bg-neutral-800 text-neutral-100"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {box === "wizard" ? <CopyBox text={text} /> : <CopyBlock text={text} />}
    </div>
  );
}
