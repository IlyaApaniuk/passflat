-- Enable Row Level Security on the two tables that shipped without it.
--
-- RLS on this project was switched on by hand in the Supabase dashboard, table
-- by table, so the tables Prisma created on 2026-07-27 (`pois`, `building_tags`)
-- were left readable, writable and DELETE-able by anyone holding the anon key —
-- which is public, it ships in the JS bundle. Verified against production on
-- 2026-07-27: anon SELECT returned all 47k POI rows and anon DELETE/PATCH were
-- accepted.
--
-- No policies are added: nothing in the app reads either table through
-- PostgREST. Server code goes through Prisma (which connects as the database
-- owner and is not subject to RLS), so enabling RLS with zero policies denies
-- every anon/authenticated request while leaving the app untouched. The REVOKE
-- is belt-and-braces for the same reason.
--
-- Every future Prisma-created table needs the same two lines — see
-- `auto_expose_new_tables = false` in supabase/config.toml.

ALTER TABLE "public"."pois" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."building_tags" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "public"."pois" FROM anon, authenticated;
REVOKE ALL ON "public"."building_tags" FROM anon, authenticated;
