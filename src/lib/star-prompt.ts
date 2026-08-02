// The one time DispatchSEO asks for a GitHub star.
//
// Timed, not permanent: the row only exists once the pipeline has actually
// put a page live, because "star us" from a product that hasn't done anything
// for you yet is begging, and the answer is no. After the first live page it
// has earned the right to ask - once. Dismissing (or clicking through) writes
// the cookie and it never comes back.
//
// Kept in lib/ rather than inline in the page so the cookie name has exactly
// one definition, shared by the reader (the dashboard) and the only writer
// (the route handler).
export const STAR_COOKIE = "ds_star";

export const REPO_URL = "https://github.com/NeoZi12/dispatchseo";

// Ask only when there's something to be thankful for AND the owner hasn't
// already answered. Any cookie value at all counts as answered - the value
// itself is never read, so a hand-edited one can only ever silence the ask,
// which is the failure direction we want.
export function shouldAskForStar(cookieValue: string | undefined, livePages: number): boolean {
  return livePages > 0 && !cookieValue;
}
