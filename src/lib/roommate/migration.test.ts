import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// PRD 3 FR-1 (spec 06 §Data model): every roommate column of both stages lives
// in one migration (D49). RLS is switched on by hand in the Supabase dashboard
// (D9), so no migration may enable it, add a policy or grant rights.

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../prisma/migrations');
const PREVIOUS_MIGRATION = '20261005140000_deposit_contract';

const RLS_STATEMENT = /enable\s+row\s+level\s+security|create\s+policy|\bgrant\b/i;

function migrationFolders(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function readMigration(folder: string): string {
  return readFileSync(join(MIGRATIONS_DIR, folder, 'migration.sql'), 'utf8');
}

const roommateFolders = migrationFolders().filter((name) => name.endsWith('_roommate_matching'));
const roommateFolder = roommateFolders[0];
const sql = roommateFolder ? readMigration(roommateFolder) : '';

describe('roommate_matching migration', () => {
  it('exists exactly once and sorts after the deposit contract migration', () => {
    expect(roommateFolders).toHaveLength(1);
    expect(roommateFolder > PREVIOUS_MIGRATION).toBe(true);
  });

  it('is the last migration: PRD 3 adds no second one (D49)', () => {
    expect(migrationFolders().at(-1)).toBe(roommateFolder);
  });

  it('holds no RLS, policy or grant statement (D9)', () => {
    expect(sql).not.toMatch(RLS_STATEMENT);
  });

  it('creates the three roommate tables and the ban marker', () => {
    expect(sql).toContain('CREATE TABLE "roommate_profiles"');
    expect(sql).toContain('CREATE TABLE "roommate_reactions"');
    expect(sql).toContain('CREATE TABLE "roommate_reports"');
    expect(sql).toMatch(
      /ALTER TABLE "telegram_chats" ADD COLUMN\s+"roommate_banned_at" TIMESTAMPTZ\(3\);/,
    );
  });

  it('keys one profile per chat and one reaction and one report per pair', () => {
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "roommate_profiles_chat_id_key" ON "roommate_profiles"("chat_id");',
    );
    expect(sql).toContain('ON "roommate_profiles"("status", "expires_at");');
    expect(sql).toContain('ON "roommate_reactions"("to_profile_id");');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "roommate_reactions_from_profile_id_to_profile_id_key" ON "roommate_reactions"("from_profile_id", "to_profile_id");',
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "roommate_reports_reporter_profile_id_target_profile_id_key" ON "roommate_reports"("reporter_profile_id", "target_profile_id");',
    );
  });

  it('cascades profiles and reactions, and nulls report references (D55)', () => {
    const foreignKey = (table: string, column: string, target: string, onDelete: string) =>
      `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_${column}_fkey" FOREIGN KEY ("${column}") REFERENCES "${target}"("id") ON DELETE ${onDelete}`;
    expect(sql).toContain(foreignKey('roommate_profiles', 'chat_id', 'telegram_chats', 'CASCADE'));
    expect(sql).toContain(
      foreignKey('roommate_reactions', 'from_profile_id', 'roommate_profiles', 'CASCADE'),
    );
    expect(sql).toContain(
      foreignKey('roommate_reactions', 'to_profile_id', 'roommate_profiles', 'CASCADE'),
    );
    expect(sql).toContain(
      foreignKey('roommate_reports', 'reporter_profile_id', 'roommate_profiles', 'SET NULL'),
    );
    expect(sql).toContain(
      foreignKey('roommate_reports', 'target_profile_id', 'roommate_profiles', 'SET NULL'),
    );
    expect(sql).toMatch(/"reporter_profile_id" UUID,/);
    expect(sql).toMatch(/"target_profile_id" UUID,/);
  });

  it('keeps the defaults of spec 06', () => {
    expect(sql).toContain(`"status" TEXT NOT NULL DEFAULT 'draft'`);
    expect(sql).toContain(`"prefers" TEXT NOT NULL DEFAULT 'anyone'`);
    expect(sql).toContain('"any_district" BOOLEAN NOT NULL DEFAULT false');
    expect(sql).toContain('"push_off" BOOLEAN NOT NULL DEFAULT false');
    expect(sql).toContain('"district_slugs" TEXT[] DEFAULT ARRAY[]::TEXT[]');
    expect(sql).toContain('"languages" TEXT[] DEFAULT ARRAY[]::TEXT[]');
    expect(sql).toContain('"about" VARCHAR(280)');
    expect(sql).toContain('"move_in_month" DATE');
    expect(sql).toContain(`"decision" TEXT NOT NULL DEFAULT 'none'`);
    expect(sql).toContain('"automated" BOOLEAN NOT NULL DEFAULT true');
  });
});

describe('every migration', () => {
  it.each(migrationFolders())('%s holds no RLS, policy or grant statement', (folder) => {
    expect(readMigration(folder)).not.toMatch(RLS_STATEMENT);
  });

  it('the RLS pattern catches each forbidden statement', () => {
    expect('ALTER TABLE "x" ENABLE ROW LEVEL SECURITY;').toMatch(RLS_STATEMENT);
    expect('create policy "read" on "x" for select using (true);').toMatch(RLS_STATEMENT);
    expect('GRANT SELECT ON "x" TO anon;').toMatch(RLS_STATEMENT);
    expect('"grantee_note" TEXT').not.toMatch(RLS_STATEMENT);
  });
});
