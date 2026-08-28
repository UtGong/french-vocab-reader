import { neon } from "@neondatabase/serverless";

export type WordRow = { id: number; word: string; phonetic: string; word_type_zh: string; meaning_zh: string; details_zh: string; source_word: string; learned_at: string };

export function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

export async function ensureAuthTables() {
  const sql = database();
  await sql`CREATE TABLE IF NOT EXISTS app_users (id BIGSERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS user_sessions (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`DELETE FROM user_sessions WHERE expires_at <= NOW()`;
  return sql;
}

export async function ensureWordsTable() {
  const sql = await ensureAuthTables();
  await sql`CREATE TABLE IF NOT EXISTS learned_words (
    id BIGSERIAL PRIMARY KEY,
    word TEXT NOT NULL UNIQUE,
    word_type_zh TEXT NOT NULL,
    meaning_zh TEXT NOT NULL,
    learned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE learned_words ADD COLUMN IF NOT EXISTS details_zh TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE learned_words ADD COLUMN IF NOT EXISTS source_word TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE learned_words ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES app_users(id) ON DELETE CASCADE`;
  await sql`ALTER TABLE learned_words ADD COLUMN IF NOT EXISTS phonetic TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE learned_words ADD COLUMN IF NOT EXISTS knowledge_analyzed_at TIMESTAMPTZ`;
  await sql`ALTER TABLE learned_words DROP CONSTRAINT IF EXISTS learned_words_word_key`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS learned_words_user_word_unique ON learned_words (user_id, LOWER(word)) WHERE user_id IS NOT NULL`;
  return sql;
}

export async function ensureKnowledgeGraphTables() {
  const sql = await ensureWordsTable();
  await sql`CREATE TABLE IF NOT EXISTS vocabulary_groups (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    group_type TEXT NOT NULL,
    description_zh TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS vocabulary_groups_user_name_type_unique ON vocabulary_groups (user_id, LOWER(name), group_type)`;
  await sql`CREATE TABLE IF NOT EXISTS vocabulary_group_members (
    group_id BIGINT NOT NULL REFERENCES vocabulary_groups(id) ON DELETE CASCADE,
    word_id BIGINT NOT NULL REFERENCES learned_words(id) ON DELETE CASCADE,
    relation_zh TEXT NOT NULL DEFAULT '',
    confidence NUMERIC(4,3) NOT NULL DEFAULT 0.8,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, word_id)
  )`;
  return sql;
}

export async function ensureStudyQueueTable() {
  const sql = await ensureAuthTables();
  await sql`CREATE TABLE IF NOT EXISTS study_queue (
    id BIGSERIAL PRIMARY KEY,
    word TEXT NOT NULL UNIQUE,
    word_type_zh TEXT NOT NULL,
    meaning_zh TEXT NOT NULL,
    details_zh TEXT NOT NULL DEFAULT '',
    source_word TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE study_queue ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES app_users(id) ON DELETE CASCADE`;
  await sql`ALTER TABLE study_queue ADD COLUMN IF NOT EXISTS phonetic TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE study_queue DROP CONSTRAINT IF EXISTS study_queue_word_key`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS study_queue_user_word_unique ON study_queue (user_id, LOWER(word)) WHERE user_id IS NOT NULL`;
  return sql;
}
