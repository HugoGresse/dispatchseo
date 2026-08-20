import type { WorkflowStep } from "./index";

// The first conversation an owner has with their own AI about their site.
//
// Three questions, because three is what someone will actually answer in a
// chat window and because these three are the ones whose absence shows up in
// every article: who it is for, what must never be said, and how it should
// sound. Everything else we can read off the site ourselves.

export const SETUP_CHAT = `## Set up {{SITE_NAME}} ({{DOMAIN}})

Do this once, with the owner present. It takes about five minutes and every
article after it comes out better for it.

Two things not to do, learned the hard way: do not ask the owner to confirm
which site this is - the connection decides that and there is only one - and
if the owner sends the starting sentence a second time while you are mid-way,
carry on from where you were rather than starting over.

### 1. Read the site first

Call \`get_site_digest\`. Our server has already read the site and kept a
summary: what sections it has, how many pages, what the recent ones are
about, how long they usually run.

Read it before asking anything. Half of what you would otherwise ask the
owner is already in there, and asking someone questions you could have
answered yourself is a bad first impression.

If it says the site has not been read yet, say so and carry on - the answers
below still work, you just have less context for them.

### 2. Ask exactly three questions

Ask them one at a time, in plain language, and wait for each answer.

1. **Who buys from you?** Not the market - the person. What is their job,
   what are they trying to do, and what do they already know? The answer
   decides the reading level of everything that follows.
2. **What should we never say?** Claims you cannot back, comparisons you do
   not want made, promises you cannot keep, competitors you would rather not
   name. This is the one that keeps an AI out of trouble.
3. **How should it sound?** Point at a page - yours or anyone's - that reads
   the way you want. If they cannot name one, ask whether they would rather
   sound like a knowledgeable friend or a careful professional.

If the owner gives short answers, follow up once, then move on. A thin answer
you actually have beats a thorough one nobody gave.

### 3. Save it

Call \`set_site_profile\` with what you learned about the business and its
customers, and \`set_conventions\` with the writing rules: the voice, the
things never to say, the reading level, the article length that suits this
site.

Write it as instructions to whoever writes next, not as notes about the
conversation. "Never promise a specific ranking" is useful. "The owner
mentioned they worry about promises" is not.

### 4. Tell them what happens now

In three or four lines, and name the screens: ask you for article ideas and
you queue them; they approve the ones they like on the dashboard's **Queue**
screen (nothing is written until they do); then they ask you to write, and
the finished article shows up on the **Drafts** screen and publishes on its
own. Then offer to research the first batch of ideas right now, or to write
the first article if the queue already has an approved one.
`;

export const SETUP_CHAT_STEPS: WorkflowStep[] = [
  { title: "Read the site", plain: "Start from the summary we already made of your site, not from questions." },
  { title: "Three questions", plain: "Who buys from you, what we must never say, and how it should sound." },
  { title: "Save it", plain: "Store the answers as instructions every future article follows." },
  { title: "Say what happens next", plain: "Explain the flow, then offer to research or write the first one." },
];
