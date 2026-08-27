import { neon } from "@neondatabase/serverless";

export type WordRow = { id: number; word: string; word_type_zh: string; meaning_zh: string; learned_at: string };

export function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

export async function ensureWordsTable() {
  const sql = database();
  await sql`CREATE TABLE IF NOT EXISTS learned_words (
    id BIGSERIAL PRIMARY KEY,
    word TEXT NOT NULL UNIQUE,
    word_type_zh TEXT NOT NULL,
    meaning_zh TEXT NOT NULL,
    learned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  return sql;
}
