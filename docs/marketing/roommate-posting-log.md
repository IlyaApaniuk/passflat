# Roommate posting log

**Draft for the owner.** One row per posting slot and one row per weekly review (PRD 3 FR-41,
spec 05 §Posting kit; D46, D53, D65). The stage 1 readout (spec 05 §Stage 1 readout, D52) reads
owner-hours from "Minutes" and the weekly manual-handling time from "Manual minutes".

## Rules

- **No people in the log.** Never write user names, @handles, chat ids or message texts (yours
  or anybody else's). A group appears only as its key from
  [`roommate-posts.md`](roommate-posts.md#group-keys).
- **A week without a row is "missing".** A week (Monday – Sunday, Europe/Warsaw) without any row
  is "missing" in the readout, not zero minutes. A week with no posting still gets a row (slot
  `none`, minutes `0`).
- **Minutes** are the minutes spent posting in that slot, replies and admin questions included.
- **Manual minutes** are the minutes spent on the product by hand outside the posting itself:
  the weekly review of hidden profiles and appeals (up to 10 minutes a week, D65) and anything
  else done by hand for a person. The stage 1 cap is 30 minutes a week on average over full
  weeks (D52).
- **Link tags** are the payloads used in the slot (`mate_tg_<key>`, ...), or `no-link` for the
  version without a link.
- **Removed posts or warnings**: a count and the group key, for example `1 removed (key)` or
  `admin warning (key)`; never the text.
- **The switch.** When `ROOMMATE_MATCHING_ENABLED` goes on, write the date and time (Europe/Warsaw)
  on the line below and add the same moment as a PostHog annotation (spec 07 §Switch): the stage 2
  readout takes it as `{switch_at}` (spec 05 §Stage 2 readout).

Switch on at: not yet.

A filled row looks like this (an example, not an entry):

```text
| 2026-12-01 | 1 | 30 | key1, key2, key3 | mate_tg_key1, mate_tg_key2, no-link | 0 | 0 |
```

Slot is `1` or `2` (D46), `review` for the weekly review of hidden profiles and appeals, or
`none` for a week without posting.

## Log

| Date | Slot | Minutes | Groups (keys) | Link tags | Removed posts or warnings | Manual minutes |
| ---- | ---- | ------- | ------------- | --------- | ------------------------- | -------------- |
