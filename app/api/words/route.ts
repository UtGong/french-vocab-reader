import { NextResponse } from "next/server";
import { ensureWordsTable } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql = await ensureWordsTable();
    const rows = await sql`SELECT id, word, word_type_zh, meaning_zh, learned_at FROM learned_words ORDER BY learned_at DESC`;
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Unable to load learned words", error);
    return NextResponse.json({ error: "Database is not configured" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const word = typeof body.word === "string" ? body.word.trim() : "";
    const wordType = typeof body.wordType === "string" ? body.wordType.trim() : "";
    const meaning = typeof body.meaning === "string" ? body.meaning.trim() : "";
    if (!word || !wordType || !meaning || word.length > 120 || wordType.length > 40 || meaning.length > 500) {
      return NextResponse.json({ error: "Invalid word data" }, { status: 400 });
    }
    const sql = await ensureWordsTable();
    const rows = await sql`INSERT INTO learned_words (word, word_type_zh, meaning_zh)
      VALUES (${word}, ${wordType}, ${meaning})
      ON CONFLICT (word) DO UPDATE SET word_type_zh = EXCLUDED.word_type_zh, meaning_zh = EXCLUDED.meaning_zh, learned_at = NOW()
      RETURNING id, word, word_type_zh, meaning_zh, learned_at`;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    console.error("Unable to save learned word", error);
    return NextResponse.json({ error: "Database is not configured" }, { status: 503 });
  }
}
