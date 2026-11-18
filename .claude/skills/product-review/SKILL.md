---
name: product-review
description: Independent review of Passflat's product direction or of one idea, with ranked improvement proposals aimed at demand and revenue, saved to docs/product/reviews. Use when the owner asks to evaluate the direction, ideas, hypotheses or what to improve in the product ("оцени направление", "что улучшить в продукте", "оцени идею ...", "как начать зарабатывать").
argument-hint: '[focus: e.g. deposit, monetization, next PRD, or an idea in words]'
---

# Product review

Reply to the owner in Russian; the report file is in English.

1. Make sure the evidence is fresh: if the newest `docs/product/reviews/*-metrics.md` is older
   than seven days and the PostHog tools are available, run the `metrics-review` skill first.
2. Spawn the `product-strategist` agent with the Agent tool. Give it today's date, the focus from
   `$ARGUMENTS` (empty means a full direction review; an idea means "evaluate this idea") and the
   path of the newest metrics readout. Do not pass your own conclusions: its value is an
   unanchored view.
3. Read the report. Spot-check the facts it cites that you can verify quickly in the repository
   or PostHog; mark anything you could not verify. Do not rewrite its judgements.
4. Save it as `docs/product/reviews/<YYYY-MM-DD>-direction-review.md` or
   `<YYYY-MM-DD>-idea-<slug>.md`, with a header naming the focus, the inputs and your
   spot-check notes. Commit it on the current branch (never `main`) with the subject
   `Product review <date>` and the last line
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
5. Reply with at most five lines: the verdict, the top three proposals, the questions, and the
   file path. If the owner may be away, send a PushNotification with the verdict.
6. Offer, do not do: turning proposals into hypotheses and experiments, into requirements of the
   next PRD, or into status changes and new assumptions in `docs/product/brd.md`. Do that only
   when the owner says which ones; a BRD change gets a date, a source and a change-log line.
