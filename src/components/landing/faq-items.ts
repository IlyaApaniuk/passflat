/**
 * The home FAQ as explicit question and answer pairs, keys under `landing.faq`
 * (PRD 4 FR-15, spec 08 §How it works, Help and About). Answers used to pair
 * with questions by position, so a question placed first would have shown `a1`.
 * The roommate question (q7) comes first.
 */
export const FAQ_ITEMS = [
  { q: 'q7', a: 'a7' },
  { q: 'q1', a: 'a1' },
  { q: 'q2', a: 'a2' },
  { q: 'q3', a: 'a3' },
  { q: 'q4', a: 'a4' },
  { q: 'q5', a: 'a5' },
  { q: 'q6', a: 'a6' },
] as const;
