import { ImageResponse } from "next/og";
import { db } from "@/lib/db";

// The cover image for a published article, drawn on demand.
//
// Three decisions worth knowing before changing anything here:
//
// 1. NO MODEL CALL. The cover is a deterministic template - the title over a
//    gradient seeded by a hash of that title. Every alternative (an image
//    model, a stock-photo API) costs money per article and adds a key that can
//    expire, and a generated photo of nothing in particular is not worth
//    either. The same title always draws the same picture, which also means
//    this route is safely cacheable and idempotent.
//
// 2. NOTHING IS STORED. The publish handler fetches this URL, uploads the PNG
//    to the customer's media library, and from then on the image lives on
//    their site. So no bytes travel through the database and nothing has to be
//    cleaned up when a draft is deleted.
//
// 3. NON-LATIN TITLES WORK, over the network. The bundled font (Geist) is
//    Latin-only, but @vercel/og carries a script-to-font map and fetches the
//    matching Noto face from fonts.googleapis.com at render time - Hebrew,
//    Arabic, Cyrillic, CJK and Thai all render without anything bundled here.
//    Verified 2026-08-20 by rendering a Hebrew title and looking at the PNG.
//    The catch worth knowing: that fetch is the whole mechanism, so on an
//    install with no outbound access to Google Fonts the glyphs quietly do not
//    draw (@vercel/og logs "Failed to load dynamic font" and returns nothing).
//    If that ever becomes a real customer's problem, the fix is to bundle a
//    Noto subset for their script and pass it as `fonts` below - not to
//    rewrite this route.
//
// 4. PUBLIC BY NECESSITY. The route is under /api, which the proxy leaves
//    ungated, and that is correct here: it renders a title that is about to be
//    published on a public page anyway, and the publish job fetches it as an
//    ordinary unauthenticated HTTP client. It exposes no credential, no tenant
//    identifier beyond a draft's own uuid, and no unpublished body text.

export const runtime = "nodejs";

const WIDTH = 1200;
const HEIGHT = 630;
/** Past this the title is trimmed. Three lines at the size below is about the
 *  most that stays readable as a thumbnail, which is where most people see it. */
const TITLE_MAX = 90;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ draftId: string }> },
): Promise<Response> {
  const { draftId } = await params;

  const { data } = await db()
    .from("article_drafts")
    .select("title, project_id")
    .eq("id", draftId)
    // This route is public (the publisher and the drafts screen both fetch it
    // with no cookie), justified by "this content is about to be published".
    // That premise is only true for drafts that got past review - a rejected
    // or discarded draft's title is nobody's business, so those 404 like a
    // draft that never existed. blocked_setup is included: it is finished
    // work waiting on a publish target, and the drafts screen shows its cover.
    .in("status", ["accepted", "finished", "published", "blocked_setup"])
    .maybeSingle();
  const draft = data as { title: string; project_id: string } | null;
  // A missing draft must 404 rather than draw a blank card: the publish
  // handler treats any non-image response as "no cover" and ships the article
  // without one, which is the right outcome, and a 404 says why.
  if (!draft) return new Response("No such article", { status: 404 });

  const { data: projectRow } = await db()
    .from("projects")
    .select("name")
    .eq("id", draft.project_id)
    .maybeSingle();
  const siteName = (projectRow as { name: string } | null)?.name ?? "";

  const title = trimTitle(draft.title ?? "");
  const [hueA, hueB] = hues(draft.title ?? "");
  // Hebrew and Arabic titles read right-to-left, and a card that pins them to
  // the left edge with the site name under the wrong corner looks like a
  // template that was never meant for this language - which is exactly the
  // impression a site publishing in Hebrew must not get from us. The glyphs
  // themselves are already ordered correctly by the layout engine; only the
  // block alignment has to follow.
  const rtl = isRtl(draft.title ?? "");
  const align = rtl ? "flex-end" : "flex-start";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          alignItems: align,
          textAlign: rtl ? "right" : "left",
          padding: "72px 80px",
          backgroundImage: `linear-gradient(135deg, hsl(${hueA}, 62%, 22%) 0%, hsl(${hueB}, 58%, 38%) 100%)`,
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 64,
            height: 6,
            borderRadius: 3,
            backgroundColor: "rgba(255,255,255,0.85)",
          }}
        />
        <div
          style={{
            display: "flex",
            fontSize: title.length > 60 ? 62 : 74,
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            // The one place a hard wrap matters: satori lays text out itself,
            // and without this a long unbroken word runs off the canvas.
            overflowWrap: "break-word",
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 28,
            fontWeight: 500,
            color: "rgba(255,255,255,0.82)",
          }}
        >
          {siteName}
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        // The drawing is a pure function of the title, so a cached copy can
        // never be stale for the article it belongs to.
        "Cache-Control": "public, max-age=86400, immutable",
      },
    },
  );
}

/** Cut a long title at a word boundary rather than mid-word. */
/** True when the text is mostly written in a right-to-left script. Hebrew
 *  (U+0590-U+05FF) and Arabic (U+0600-U+06FF, U+0750-U+077F, U+08A0-U+08FF)
 *  cover every market this product is aimed at today; a title mixing a Latin
 *  brand name into Hebrew prose still counts, hence "any RTL letter" rather
 *  than "all of them". */
function isRtl(text: string): boolean {
  return /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);
}

function trimTitle(raw: string): string {
  const t = raw.trim();
  if (t.length <= TITLE_MAX) return t;
  const cut = t.slice(0, TITLE_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
}

/**
 * Two gradient hues from the title. Deterministic on purpose: re-rendering the
 * same article must produce the same picture, or a retried publish would
 * upload a second, different cover to the customer's media library.
 *
 * The second hue sits 40 degrees round the wheel from the first, which keeps
 * every pair a related two-tone rather than an accidental clash.
 */
function hues(title: string): [number, number] {
  let h = 2166136261; // FNV-1a, 32-bit
  for (let i = 0; i < title.length; i++) {
    h ^= title.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const base = Math.abs(h) % 360;
  return [base, (base + 40) % 360];
}
