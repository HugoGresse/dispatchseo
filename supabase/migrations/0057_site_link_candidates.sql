-- The crawled page inventory, kept apart from the digest it sits next to.
--
-- 0055 gave site_digests one jsonb column, `digest`, described there as "the
-- compact summary a chat AI reads INSTEAD of crawling the site itself" - and
-- that description is load-bearing: it is budgeted to stay small enough to fit
-- inside a $20 ChatGPT or Claude plan's context without crowding out the
-- article being written.
--
-- Internal linking needs something different: the full list of the site's
-- pages with their titles, so the finisher can turn a phrase in a new article
-- into a link to an existing page. That list is an order of magnitude larger
-- than the digest and is read by our own server, never by the customer's AI.
--
-- Folding the two together would have quietly broken the thing the digest
-- exists for. Hence a second column rather than a wrapper object inside the
-- first one.

alter table site_digests
  add column if not exists link_candidates jsonb not null default '[]'::jsonb;

comment on column site_digests.link_candidates is
  'Crawled pages as [{url,title,keywords}] for the finisher to link into. Server-side only - never sent to a customer''s AI, which reads `digest` instead.';
