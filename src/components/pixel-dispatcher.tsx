"use client";

import { useEffect, useRef } from "react";
import { DEFAULT_AGENT, agentById, isSupportedAgent } from "@/lib/agents";

// Pixel-art hero scene: the agent (a clay-colored blob, our nod to Claude
// Code's mascot) walks in from the left, hops onto the chair at the dispatch
// desk, a headset drops onto its head, and it settles in for the shift:
// breathing, blinking, the monitor's rank chart climbing, the coffee steaming.
//
// Rendered on a <canvas>, NOT SVG-in-the-DOM, on purpose: an SVG frame
// animation re-creates dozens of <rect> nodes ~8x/second, and that constant
// DOM churn makes page-scanning tools (Chrome Translate, Grammarly) re-walk
// the whole document on every frame - which stole focus from form fields on
// the onboarding wizard (2026-07-23). A canvas updates its bitmap with zero
// DOM mutation, so nothing downstream can react to it.

const TICK_MS = 120;

// Timeline (in ticks)
const WALK_END = 34; // walking ends, hop begins
const HOP_END = 38; // hop ends, seated
const DROP_START = 40; // headset starts dropping
const DROP_END = 45; // headset on - idle loop from here

// The drawing coordinate space (matches the old SVG viewBox "20 12 128 32"):
// everything is authored in these units, then offset into a 128x32 canvas.
const VB_X = 20;
const VB_Y = 12;
const VB_W = 128;
const VB_H = 32;

// Body colour is the only thing that changes between agents - the desk, the
// headset, the monitor and everything else stays the site's own clay/violet,
// so recolouring the character never reads as a second theme. "clay" (our
// nod to Claude Code's rust) is the default and the only palette every
// existing call site renders, byte-identical to before variants existed.
// Every other agent's body/shade pair comes off its registry entry
// (src/lib/agents/index.ts `mascot`), so a new agent brings its own colour
// without this file changing. Eyes stay the same dark ink for everyone, per
// the character's own design.
export type MascotVariant = string; // an agent id, or "clay" (the default body)

const CLAY: Record<string, string> = {
  c: "#d97757", // clay body
  C: "#b0563a", // clay shade / legs
  e: "#1a1a1e", // eyes
  v: "#8b5cf6", // violet (headset, mug)
  V: "#6d3fd8", // violet shade
  m: "#d4d4d8", // mic tip
};

// Two ways the variant arrives, one resolver:
//   1. An explicit `variant` prop (an agent id) - the per-agent landing hub
//      pages know statically which agent they present, and a non-default
//      agent's registry colour wins.
//   2. A CSS variable (--dispatcher-agent, an agent id) stamped by the
//      dashboard layout from the active project's agent - because the
//      dispatcher also shows on loading screens, which render synchronously
//      with no way to ask which project is active. Read per frame, so a live
//      agent switch retints on the next tick instead of waiting for a
//      remount. The var carries the ID, not colours: the palette always
//      resolves from the registry, so the two paths cannot drift.
// Anywhere neither applies (landing hero, wizard) the clay default renders,
// byte-identical to before variants existed.
function paletteFor(canvas: HTMLCanvasElement, variant: MascotVariant): Record<string, string> {
  let id: string = variant;
  if (id === "clay" || !isSupportedAgent(id)) {
    id = getComputedStyle(canvas).getPropertyValue("--dispatcher-agent").trim();
  }
  if (!isSupportedAgent(id) || id === DEFAULT_AGENT) return CLAY;
  const m = agentById(id).mascot;
  return { ...CLAY, c: m.body, C: m.shade };
}

// 12 x 11 character grids ('.' = transparent)
const BODY_OPEN = [
  "...cccccc...",
  "..cccccccc..",
  ".cccccccccc.",
  ".cccccccccc.",
  ".ccccecccec.",
  ".ccccecccec.",
  ".cccccccccc.",
  ".cCCCCCCCCc.",
  "..CCCCCCCC..",
];
const BODY_BLINK = [
  ...BODY_OPEN.slice(0, 4),
  ".cccccccccc.",
  ".ccccCcccCc.",
  ...BODY_OPEN.slice(6),
];
const LEGS_STRIDE = ["..CC....CC..", ".CC......CC."];
const LEGS_PASS = ["...CC..CC...", "...CC..CC..."];
const LEGS_SIT = ["..CC....CC..", "..CC....CC.."];

const WALK_A = [...BODY_OPEN, ...LEGS_STRIDE];
const WALK_B = [...BODY_OPEN, ...LEGS_PASS];
const SIT = [...BODY_OPEN, ...LEGS_SIT];
const SIT_BLINK = [...BODY_BLINK, ...LEGS_SIT];

// 12 x 9 headset grid, anchored 1 unit above the character's head
const HEADSET = [
  ".vvvvvvvvvv.",
  "v..........v",
  "v..........v",
  "V..........V",
  "Vv........vV",
  "Vv........vV",
  "VV........VV",
  "..........Vm",
];

// Seated character position (right up against the desk, hands over the keys)
const SEAT_X = 66;
const SEAT_Y = 23;
// Hop arc from the end of the walk up onto the chair
const HOP_ARC: Array<[number, number]> = [
  [55, 28],
  [60, 24],
  [63, 21],
  [SEAT_X, SEAT_Y],
];

const CHART_TARGETS = [2, 3, 4, 5];
const CHART_X = [90, 92, 94, 96];
const CHART_BASE = 27; // bars grow upward from here

function fillPx(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(x - VB_X, y - VB_Y, w, h);
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  grid: string[],
  ox: number,
  oy: number,
  palette: Record<string, string>,
) {
  for (let r = 0; r < grid.length; r++) {
    for (let col = 0; col < grid[r].length; col++) {
      const ch = grid[r][col];
      if (ch === ".") continue;
      fillPx(ctx, ox + col, oy + r, 1, 1, palette[ch]);
    }
  }
}

// Draw the whole scene at tick t. Same composition + order as the old SVG,
// so later paints (desk, monitor) still sit in front of the character.
function drawScene(ctx: CanvasRenderingContext2D, t: number, palette: Record<string, string>) {
  ctx.clearRect(0, 0, VB_W, VB_H);

  // --- character position + frame ---
  let charX: number;
  let charY: number;
  let grid: string[];
  if (t < WALK_END) {
    charX = Math.round(4 + ((50 - 4) * t) / WALK_END);
    charY = 29;
    grid = Math.floor(t / 2) % 2 === 0 ? WALK_A : WALK_B;
  } else if (t < HOP_END) {
    [charX, charY] = HOP_ARC[Math.min(t - WALK_END, HOP_ARC.length - 1)];
    grid = SIT;
  } else {
    charX = SEAT_X;
    charY = SEAT_Y;
    const idle = t - DROP_END;
    if (idle >= 0) {
      charY += idle % 16 < 8 ? 0 : 1;
      grid = idle % 27 < 2 ? SIT_BLINK : SIT;
    } else {
      grid = SIT;
    }
  }

  // --- headset drop offset ---
  let headsetY: number | null = null;
  if (t >= DROP_START) {
    const drops = [-10, -7, -4, -2, -1];
    headsetY = charY + drops[Math.min(t - DROP_START, drops.length - 1)];
  }

  const screenOn = t >= DROP_END;

  // floor
  fillPx(ctx, 24, 40, 120, 1, "#232329");
  fillPx(ctx, 40, 41, 88, 1, "#17171b");

  // chair: backrest, seat, legs
  fillPx(ctx, 64, 26, 2, 6, "#3a3a42");
  fillPx(ctx, 66, 32, 12, 2, "#3a3a42");
  fillPx(ctx, 67, 34, 2, 6, "#2e2e35");
  fillPx(ctx, 74, 34, 2, 6, "#2e2e35");

  // character + headset
  drawGrid(ctx, grid, charX, charY, palette);
  if (headsetY !== null) drawGrid(ctx, HEADSET, charX, headsetY, palette);

  // desk
  fillPx(ctx, 77, 30, 32, 1, "#3a3a42");
  fillPx(ctx, 77, 31, 32, 1, "#2e2e35");
  fillPx(ctx, 78, 32, 2, 8, "#2e2e35");
  fillPx(ctx, 105, 32, 2, 8, "#2e2e35");

  // keyboard
  fillPx(ctx, 79, 29, 7, 1, "#2e2e35");
  fillPx(ctx, 80, 29, 1, 1, "#3a3a42");
  fillPx(ctx, 82, 29, 1, 1, "#3a3a42");
  fillPx(ctx, 84, 29, 1, 1, "#3a3a42");

  // monitor: bezel, screen, chart, live dot, stand
  fillPx(ctx, 88, 19, 13, 9, "#26262c");
  fillPx(ctx, 89, 20, 11, 7, screenOn ? "#12121a" : "#0a0a0c");
  if (screenOn) {
    const growth = Math.floor(((t - DROP_END) % 46) / 2);
    for (let i = 0; i < CHART_TARGETS.length; i++) {
      const h = Math.min(CHART_TARGETS[i], Math.max(0, growth - i * 3));
      if (h > 0) fillPx(ctx, CHART_X[i], CHART_BASE - h, 2, h, "#4ade80");
    }
  }
  if (screenOn && t % 6 < 3) fillPx(ctx, 98, 21, 1, 1, "#8b5cf6");
  fillPx(ctx, 93, 28, 3, 2, "#26262c");

  // mug + steam
  fillPx(ctx, 103, 27, 2, 3, "#8b5cf6");
  fillPx(ctx, 105, 28, 1, 1, "#6d3fd8");
  if (t % 8 < 4) {
    fillPx(ctx, 103, 24, 1, 1, "#4b4b55");
    fillPx(ctx, 104, 22, 1, 1, "#3a3a42");
  } else {
    fillPx(ctx, 104, 24, 1, 1, "#4b4b55");
    fillPx(ctx, 103, 22, 1, 1, "#3a3a42");
  }
}

// ---------------------------------------------------------------------------
// Desk: the seated scene, cropped in tight
// ---------------------------------------------------------------------------
//
// The full scene is authored 128 units wide because the character walks in
// from the left, and almost all of that width is empty floor once it sits
// down. Rendering the whole thing big enough to see the agent's face would put
// a 500px strip of nothing across the card.
//
// So this crops to the part that has the desk in it: chair, agent, desk,
// keyboard, monitor and mug, from x 42 to x 92 and y 5 to y 30 in the scene's
// own canvas space. Same drawScene, same palette resolver, same idle loop
// (blink, breath, the chart climbing, the steam) - it is a viewport onto the
// existing scene, not a second drawing of it, so the two can never drift.
const DESK_X = 42;
const DESK_Y = 5;
const DESK_W = 50;
const DESK_H = 25;

export function PixelDesk({
  className,
  variant = "clay",
}: {
  className?: string;
  variant?: MascotVariant;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    const paint = (t: number) => {
      // Shift the scene's coordinate space so the crop lands on the canvas.
      ctx.setTransform(1, 0, 0, 1, -DESK_X, -DESK_Y);
      // drawScene clears only its own 128x32 rectangle, which no longer covers
      // the whole canvas once translated - clear the real canvas here or the
      // right edge keeps the previous frame.
      ctx.clearRect(DESK_X, DESK_Y, DESK_W, DESK_H);
      drawScene(ctx, t, paletteFor(canvas, variant));
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      paint(DROP_END + 36);
      return;
    }
    // Start seated with the headset already on: this is a card that renders on
    // every visit, and watching the agent walk to its chair on the fiftieth
    // load is charming exactly zero of those times.
    let t = DROP_END;
    paint(t);
    const id = setInterval(() => {
      t += 1;
      paint(t);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [variant]);

  return (
    <canvas
      ref={canvasRef}
      width={DESK_W}
      height={DESK_H}
      role="img"
      aria-label="Pixel art: your SEO agent at its desk, headset on, watching a rank chart climb"
      translate="no"
      className={`block h-auto [image-rendering:pixelated] ${className ?? ""}`}
    />
  );
}

// working: start already seated at the desk (skip the ~5s walk-in) and loop
// the typing/idle animation - the right state for a persistent header or a
// loading spinner, where the agent is "on the job" rather than arriving.
export function PixelDispatcher({
  className,
  working,
  variant = "clay",
}: {
  className?: string;
  working?: boolean;
  variant?: MascotVariant;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    // Reduced motion: paint the settled scene once, no ticking.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      drawScene(ctx, DROP_END + 36, paletteFor(canvas!, variant));
      return;
    }
    let t = working ? DROP_END : 0;
    drawScene(ctx, t, paletteFor(canvas!, variant));
    const id = setInterval(() => {
      t += 1;
      drawScene(ctx, t, paletteFor(canvas!, variant));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [working, variant]);

  return (
    <div className={className ?? "pixel-stage"}>
      <canvas
        ref={canvasRef}
        width={VB_W}
        height={VB_H}
        role="img"
        aria-label="Pixel art: a small AI agent at a dispatch desk, headset on, working"
        translate="no"
        className="block h-auto w-full [image-rendering:pixelated]"
      />
    </div>
  );
}
