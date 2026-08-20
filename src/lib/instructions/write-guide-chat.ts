import type { WorkflowStep } from "./index";

// Writing one article, for a chat model.
//
// Derived from build-guide, with every step that needs a machine removed: no
// files, no build command, no pull request, no metadata block to hand-write.
// What is left is the part that was always the valuable half - decide whether
// the article should exist, find what the current results miss, write
// something that fills that gap, and check it before handing it in.
//
// The self-check list near the end mirrors what submit_article's gate
// actually enforces. It is repeated here deliberately: a model that satisfies
// the gate before submitting turns a three-round conversation into one, and
// on a chat plan those rounds are the owner's own money.

export const WRITE_GUIDE_CHAT = `## Write and hand in one article

{{PACING_NOTE}}

### 1. Pick the article

Call \`get_build_brief\`. It gives you the idea at the top of the owner's
queue, how the site has been performing, and what the site's recent articles
look like - in one call, so you do not spend four.

It only ever returns an idea the owner has **approved**. If it says there is
none, stop and tell the owner exactly what to do: open the dashboard's
**Queue** screen, approve an idea, then ask you again. Do not research or
write an idea that is still pending - the hand-in is refused for an
unapproved idea on a site that approves by hand, and the work is wasted. If
the owner dictates a topic that is not in the queue, propose it with
\`propose_suggestion\`, tell them to approve it on the Queue screen, and wait.

### 2. Check whether the research is already done

Call \`get_research_notes\` with the idea's id. If notes come back, the
research half is finished: read them and skip to step 4. If not, do step 3.

### 3. Look at what already ranks

Call \`check_serp\` for the main keyword. Open the top three results yourself
and read them. You are answering two questions:

- **Does this article deserve to exist?** If the top results already answer
  the question completely and the site has nothing to add, say so and pick
  the next idea. Publishing the fourth version of the same article is how a
  site earns a reputation for saying nothing.
- **What do they all miss?** This is the article's reason to exist. Write it
  down in one sentence before you write anything else. Common gaps worth
  filling: no real numbers, no worked example, out of date, written for a
  different level of reader, avoids the awkward part of the question.

Also call \`get_site_digest\` if you have not already, so the new article
does not repeat one the site already has.

If you are stopping here and writing later, save everything with
\`save_research_notes\` first.

### 4. Write it

Plain markdown. Nothing else - no metadata block at the top, no HTML, and do
not wrap the whole thing in a code fence.

- One \`#\` heading: the title.
- \`##\` sections, \`###\` under them where it helps.
- 900 to 2500 words. Under 900 reads as a stub; over 2500 usually means it
  rambled rather than covered more ground.
- The main keyword in the title, once in the first paragraph written the way
  a person would say it, and in one section heading if it fits naturally.
  Don't force it anywhere else.
- At least one list or table.
- At least two real sources, as full links to specific pages that support a
  specific claim. Not homepages, not made up. If you cannot find a real
  source for a claim, cut the claim.
- Answer the question in the first two paragraphs. Do not open with three
  paragraphs about why the topic matters.

### 5. Check it before you hand it in

Run \`check_sameness\` with the draft and the keyword. If it fails, the
article is shaped like ones the site already published - change the opening
and the section structure, not just the words, and run it again.

Then read your own draft against this list, because the server checks all of
it and will hand the article back otherwise:

- One \`#\` heading, and it is the title
- 900 to 2500 words
- The exact keyword appears in the title and in the opening paragraph
- Every \`##\` section has real content under it, not one line
- At least one list or table
- Two or more real, different source links
- No placeholder text anywhere: no "TODO", no "lorem ipsum", no
  "example.com", no "[insert x here]"
- No invented statistics, and no claim about the owner's product that they
  did not tell you
- A meta description of roughly 120 to 160 characters
- Any FAQ entries are real questions ending in "?" with answers of at least a
  couple of sentences

### 6. Hand it in

Call \`submit_article\` with the id of the idea you worked from, the title, a
slug, the meta description, the keyword, the markdown, your FAQ entries, and
your sources.

If it comes back accepted, you are done. Say so in one line and stop - our
server takes it from there and the owner does not need a summary of what you
just did.

If it comes back with problems, each one carries a \`fix\` written for you.
Apply them all and call \`submit_article\` again with the same idea id, which
updates the same draft rather than making a second one.

**Three tries, then stop.** If it still will not pass, tell the owner exactly
which checks failed and what they said. A fourth attempt at the same wall
spends their plan for nothing.
`;

export const WRITE_GUIDE_CHAT_STEPS: WorkflowStep[] = [
  { title: "Pick the article", plain: "Take the idea at the top of your approved queue." },
  { title: "Reuse earlier research", plain: "If an earlier chat already researched this idea, read its notes instead of doing it twice." },
  { title: "Read the competition", plain: "Look at what currently ranks and decide what it misses - that gap is the article's reason to exist." },
  { title: "Write it", plain: "A real article in plain markdown, matched to how your site already writes." },
  { title: "Self-check", plain: "Check it against the same rules our gate enforces, before spending a round trip on them." },
  { title: "Hand it in", plain: "Submit it. We check, format, link, illustrate and publish it for you." },
];
