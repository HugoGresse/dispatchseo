import type { ReactNode } from "react";

// The clay agent's front face - the exact BODY_OPEN grid from the pixel
// dispatcher, minus the headset. Same character as the animation, drawn as
// crisp SVG rects, sized by the caller.
//
// Lives on its own (and deliberately WITHOUT "use client") so both the
// landing page's client-side mascot aside (why-card.tsx) and the static
// server-rendered signup notice can draw the same face. Duplicating the grid
// would let the character drift between surfaces.
const FACE = [
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
const FACE_COLORS: Record<string, string> = {
  c: "#d97757",
  C: "#b0563a",
  e: "#1a1a1e",
};

export function MascotFace({ className }: { className?: string }) {
  const cols = FACE[0].length;
  const rows = FACE.length;
  const rects: ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = FACE[r][c];
      if (ch === ".") continue;
      rects.push(
        <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill={FACE_COLORS[ch]} />,
      );
    }
  }
  return (
    <svg
      className={className}
      viewBox={`0 0 ${cols} ${rows}`}
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      {rects}
    </svg>
  );
}
