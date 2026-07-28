-- One cost report per submitter per building, enforced by the database.
--
-- The route already re-reads before inserting, but two genuinely simultaneous
-- submissions can still pass that check and write two rows — and duplicates
-- skew the medians, which are the product's only asset. Read-then-write cannot
-- close that window; a unique index can.
--
-- Both indexes are PARTIAL, and that is the whole reason this is hand-written
-- SQL rather than an `@@unique` in schema.prisma (Prisma cannot express a WHERE
-- clause on a unique constraint):
--
--   * `author_id` is NOT NULL, and anonymous submissions are owned by the
--     ANON_AUTHOR_ID system profile. That profile — along with the import and
--     scraped ones — legitimately owns many reports for the same building, so a
--     plain unique index would reject every future import. The three system ids
--     come from src/lib/import-constants.ts.
--
--   * Anonymous submitters are told apart by their browser id instead. NULLs
--     never collide in a Postgres unique index, so the WHERE clause there only
--     keeps the index small; it is not what makes it correct.
--
-- Verified against production before writing this: zero existing duplicates on
-- either axis, so both indexes build without a cleanup step. Not CONCURRENTLY —
-- Prisma runs migrations inside a transaction, and at this table size the lock
-- is instantaneous.
--
-- `POST /api/cost-reports` already handles the violation: it catches P2002,
-- re-reads the submitter's own report and answers 409 ALREADY_EXISTS with its
-- id, so the loser of the race gets the "edit your existing report" card rather
-- than a 500.

CREATE UNIQUE INDEX "cost_reports_one_per_author_building"
  ON "cost_reports" ("author_id", "building_id")
  WHERE "author_id" NOT IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000002'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  );

CREATE UNIQUE INDEX "cost_reports_one_per_anon_building"
  ON "cost_reports" ("anonymous_id", "building_id")
  WHERE "anonymous_id" IS NOT NULL;
