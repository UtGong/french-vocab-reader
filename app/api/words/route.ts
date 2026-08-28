import { after, NextResponse } from "next/server";
import { ensureStudyQueueTable, ensureWordsTable } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { refreshKnowledgeGraph } from "@/lib/knowledge-graph";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const clean = (value: unknown, limit: number) => typeof value === "string" ? value.trim().slice(0, limit) : "";

export async function GET() {
  try {
    const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const sql = await ensureWordsTable();
    await ensureStudyQueueTable();
    await sql`DELETE FROM learned_words a USING learned_words b WHERE a.user_id = ${user.id} AND b.user_id = ${user.id} AND a.id > b.id AND LOWER(a.word) = LOWER(b.word)`;
    const rows = await sql`SELECT id, word, phonetic, word_type_zh, meaning_zh, details_zh, source_word, learned_at FROM learned_words WHERE user_id = ${user.id} ORDER BY learned_at DESC`;
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Unable to load learned words", error);
    return NextResponse.json({ error: "Database is not configured" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = await request.json();
    const word = typeof body.word === "string" ? body.word.trim() : "";
    const wordType = typeof body.wordType === "string" ? body.wordType.trim() : "";
    const meaning = typeof body.meaning === "string" ? body.meaning.trim() : "";
    const details = clean(body.details, 1000), sourceWord = clean(body.sourceWord, 120), phonetic = clean(body.phonetic, 120);
    if (!word || !wordType || !meaning || word.length > 120 || wordType.length > 40 || meaning.length > 500) {
      return NextResponse.json({ error: "Invalid word data" }, { status: 400 });
    }
    const sql = await ensureWordsTable();
    await ensureStudyQueueTable();
    const existing = await sql`SELECT id FROM learned_words WHERE user_id = ${user.id} AND LOWER(word) = LOWER(${word}) LIMIT 1`;
    const rows = existing.length
      ? await sql`UPDATE learned_words SET word = ${word}, phonetic = ${phonetic}, word_type_zh = ${wordType}, meaning_zh = ${meaning}, details_zh = ${details}, source_word = ${sourceWord} WHERE id = ${existing[0].id} AND user_id = ${user.id} RETURNING id, word, phonetic, word_type_zh, meaning_zh, details_zh, source_word, learned_at`
      : await sql`INSERT INTO learned_words (user_id, word, phonetic, word_type_zh, meaning_zh, details_zh, source_word) VALUES (${user.id}, ${word}, ${phonetic}, ${wordType}, ${meaning}, ${details}, ${sourceWord}) RETURNING id, word, phonetic, word_type_zh, meaning_zh, details_zh, source_word, learned_at`;
    await sql`DELETE FROM study_queue WHERE user_id = ${user.id} AND LOWER(word) = LOWER(${word})`;
    if (!existing.length) after(async () => { try { await refreshKnowledgeGraph(user.id); } catch (error) { console.error("Unable to refresh knowledge graph in background", error); } });
    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    console.error("Unable to save learned word", error);
    return NextResponse.json({ error: "Database is not configured" }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = await request.json();
    const id = Number(body.id);
    const word = typeof body.word === "string" ? body.word.trim() : "";
    const wordType = typeof body.wordType === "string" ? body.wordType.trim() : "";
    const meaning = typeof body.meaning === "string" ? body.meaning.trim() : "";
    const details = clean(body.details, 1000), sourceWord = clean(body.sourceWord, 120), phonetic = clean(body.phonetic, 120);
    if (!Number.isInteger(id) || id < 1 || !word || !wordType || !meaning || word.length > 120 || wordType.length > 40 || meaning.length > 500) {
      return NextResponse.json({ error: "Invalid word data" }, { status: 400 });
    }
    const sql = await ensureWordsTable();
    await ensureStudyQueueTable();
    const duplicate = await sql`SELECT id FROM learned_words WHERE user_id = ${user.id} AND LOWER(word) = LOWER(${word}) AND id <> ${id} LIMIT 1`;
    if (duplicate.length) return NextResponse.json({ error: "Duplicate word" }, { status: 409 });
    const rows = await sql`UPDATE learned_words
      SET word = ${word}, phonetic = ${phonetic}, word_type_zh = ${wordType}, meaning_zh = ${meaning}, details_zh = ${details}, source_word = ${sourceWord}
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING id, word, phonetic, word_type_zh, meaning_zh, details_zh, source_word, learned_at`;
    if (!rows[0]) return NextResponse.json({ error: "Word not found" }, { status: 404 });
    await sql`DELETE FROM study_queue WHERE user_id = ${user.id} AND LOWER(word) = LOWER(${word})`;
    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error("Unable to update learned word", error);
    return NextResponse.json({ error: "Unable to update word" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const sql = await ensureWordsTable();
    await sql`DELETE FROM learned_words WHERE id = ${id} AND user_id = ${user.id}`;
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Unable to delete learned word", error);
    return NextResponse.json({ error: "Unable to delete word" }, { status: 503 });
  }
}
