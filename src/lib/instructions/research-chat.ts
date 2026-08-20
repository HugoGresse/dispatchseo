import type { WorkflowStep } from "./index";

// Filling the queue, for a chat model.
//
// The whole discipline here is refusing to queue things. A chat session with
// a keyword tool will happily produce forty ideas, and thirty-five of them
// will be terms the site cannot rank for or terms whose searchers will never
// buy anything. Five defensible ideas is a good week.

export const RESEARCH_CHAT = `## Find what to write next for {{SITE_NAME}}

The aim is a handful of ideas the owner can approve without thinking twice.
Five good ones beat forty.

### 1. Learn where the site stands

Call \`get_site_digest\` (what the site already covers) and \`get_overview\`
(what it already ranks for, and how strong the domain is).

Two things come out of this and both matter:

- **What is already covered.** An idea the site already has is not an idea.
- **How strong the site is.** A site with little authority cannot win
  competitive terms yet, however good the article is. Aim at the specific,
  lower-competition questions its buyers actually type.

### 2. Start from the product, not from a tool

Before touching any keyword tool, write down what this business actually
does and the questions someone has just before they buy it. Those questions
are the good keywords. Tools are for checking them, not for finding them.

### 3. Check the candidates

- \`suggest_keywords\` widens a seed into what people really type. Free.
- \`keyword_ideas\` gives real search volume and difficulty. It costs the
  owner money per call, so send your best five seeds in one call, not twenty
  seeds one at a time.
- \`check_serp\` shows who currently ranks. Use it on the few you are
  seriously considering, not on everything.

If the numbers are not available, say so and decide from the search results
and your knowledge of the business. Never fill the gap with a made-up figure.

### The bar a candidate has to clear

The full version of this bar runs to ten pages and is written for a coding
agent with room to spare. This is the same bar, stated short, because on a
chat plan the pages themselves would cost more than the research.

**Difficulty scales with how strong the site is.** Call \`get_overview\` for the
domain rating, then:

| Domain rating | Queue it without asking | Worth queueing for the owner to judge |
|---|---|---|
| under 10, or unknown | difficulty under 10 | 10 to 20, if page one looks weak |
| 10 to 19 | under 15 | 15 to 25, if page one looks weak |
| 20 to 34 | under 25 | 25 to 35, if page one looks weak |
| 35 and up | under 35 | 35 to 45, if page one looks weak |

**What ranks now beats any difficulty score.** Difficulty is a guess made from
links; the search results are the fact. So on anything you are seriously
considering, call \`check_serp\` and count how many of the top ten are
established names that plainly outrank this site - big brands, the official
documentation, a first-party source. **Four or more and the idea is dead**, no
matter how low the difficulty number was. Two or fewer and the number stops
mattering: queue it and say why.

**Page one looks weak when** the top results are thin, years out of date,
mostly forum threads or aggregators, or answering a different question than
the one being asked. That is what makes a hard-looking keyword worth trying.

**Search volume follows the same logic.** On a small site aim for a few
hundred to a couple of thousand searches a month: enough to matter, small
enough to win. A high-volume term is not automatically out - if the search
results are weak, take it anyway and say that is why.


### 4. Keep only what survives

Drop an idea if any of these is true:

- The site already covers it
- The people searching it are not the people who buy
- The current top results are strong, thorough and recent, and you cannot say
  what a new article would add
- You cannot state its angle in one sentence

### 5. Queue them

One \`propose_suggestion\` call per idea. Give each a title, the keyword, and
a rationale that says why this one is worth the owner's time: who is
searching it, what they want, what the current results miss, and any real
numbers you have. The owner approves or rejects from that sentence, so make
it the sentence you would want to read.

Pass \`volume\` and \`kd\` when you actually measured them, and leave them out
when you did not. An empty field is honest; a guessed one is not.

When you are done, tell the owner in one line where the ideas went and what
happens next: they are waiting on the dashboard's **Queue** screen; approve
the ones worth writing, then ask you to write the first one. On a site set to
automatic the ideas are approved for them and you can offer to write now.

### 6. If you researched deeply, save it

If you read the search results properly for an idea - what the top pages
cover, where they are thin, the angle worth taking - save that with
\`save_research_notes\` against the idea's id. Whoever writes it next reads
your notes instead of paying to do the same reading again.
`;

export const RESEARCH_CHAT_STEPS: WorkflowStep[] = [
  { title: "See where you stand", plain: "What the site already covers and already ranks for." },
  { title: "Start from the product", plain: "The questions buyers ask just before they buy are the good keywords." },
  { title: "Check them", plain: "Real volume and difficulty where we have it, live search results where we do not." },
  { title: "Throw most of them away", plain: "Keep only the ones with an angle you can state in a sentence." },
  { title: "Queue them", plain: "Each with a rationale you can approve or reject at a glance." },
  { title: "Save the research", plain: "So writing the article does not pay for the same reading twice." },
];
