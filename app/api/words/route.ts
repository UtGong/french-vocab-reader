import { NextResponse } from "next/server";
import { ensureStudyQueueTable, ensureWordsTable } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql = await ensureWordsTable();
    await ensureStudyQueueTable();
    await sql`DELETE FROM learned_words a USING learned_words b WHERE a.id > b.id AND LOWER(a.word) = LOWER(b.word)`;
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
    await ensureStudyQueueTable();
    const existing = await sql`SELECT id FROM learned_words WHERE LOWER(word) = LOWER(${word}) LIMIT 1`;
    const rows = existing.length
      ? await sql`UPDATE learned_words SET word = ${word}, word_type_zh = ${wordType}, meaning_zh = ${meaning}, learned_at = NOW() WHERE id = ${existing[0].id} RETURNING id, word, word_type_zh, meaning_zh, learned_at`
      : await sql`INSERT INTO learned_words (word, word_type_zh, meaning_zh) VALUES (${word}, ${wordType}, ${meaning}) RETURNING id, word, word_type_zh, meaning_zh, learned_at`;
    await sql`DELETE FROM study_queue WHERE LOWER(word) = LOWER(${word})`;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    console.error("Unable to save learned word", error);
    return NextResponse.json({ error: "Database is not configured" }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = Number(body.id);
    const word = typeof body.word === "string" ? body.word.trim() : "";
    const wordType = typeof body.wordType === "string" ? body.wordType.trim() : "";
    const meaning = typeof body.meaning === "string" ? body.meaning.trim() : "";
    if (!Number.isInteger(id) || id < 1 || !word || !wordType || !meaning || word.length > 120 || wordType.length > 40 || meaning.length > 500) {
      return NextResponse.json({ error: "Invalid word data" }, { status: 400 });
    }
    const sql = await ensureWordsTable();
    await ensureStudyQueueTable();
    const duplicate = await sql`SELECT id FROM learned_words WHERE LOWER(word) = LOWER(${word}) AND id <> ${id} LIMIT 1`;
    if (duplicate.length) return NextResponse.json({ error: "Duplicate word" }, { status: 409 });
    const rows = await sql`UPDATE learned_words
      SET word = ${word}, word_type_zh = ${wordType}, meaning_zh = ${meaning}, learned_at = NOW()
      WHERE id = ${id}
      RETURNING id, word, word_type_zh, meaning_zh, learned_at`;
    if (!rows[0]) return NextResponse.json({ error: "Word not found" }, { status: 404 });
    await sql`DELETE FROM study_queue WHERE LOWER(word) = LOWER(${word})`;
    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error("Unable to update learned word", error);
    return NextResponse.json({ error: "Unable to update word" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const sql = await ensureWordsTable();
    await sql`DELETE FROM learned_words WHERE id = ${id}`;
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Unable to delete learned word", error);
    return NextResponse.json({ error: "Unable to delete word" }, { status: 503 });
  }
}
