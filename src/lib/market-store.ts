import { db } from "@/lib/db";
import { validateMarket } from "@/lib/market";

// The one write for a project's search market. Both doors call this - the
// Settings row's server action and the set_market MCP tool - per the parity
// rule. Returns an error message or null, like setTrackedProperty.
export async function setProjectMarket(
  projectId: string,
  locationCode: number,
  languageCode: string,
): Promise<string | null> {
  const invalid = validateMarket(locationCode, languageCode);
  if (invalid) return invalid;
  const { error } = await db()
    .from("projects")
    .update({ location_code: locationCode, language_code: languageCode })
    .eq("id", projectId);
  return error ? error.message : null;
}
