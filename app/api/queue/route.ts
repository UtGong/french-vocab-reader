import { NextResponse } from "next/server";
import { ensureStudyQueueTable, ensureWordsTable } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
const clean = (value: unknown, limit: number) => typeof value === "string" ? value.trim().slice(0, limit) : "";

export async function GET() {
  try {
    const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const sql = await ensureStudyQueueTable();
    await ensureWordsTable();
    await sql`DELETE FROM study_queue a USING study_queue b WHERE a.user_id = ${user.id} AND b.user_id = ${user.id} AND a.id > b.id AND LOWER(a.word) = LOWER(b.word)`;
    await sql`DELETE FROM study_queue q USING learned_words l WHERE q.user_id = ${user.id} AND l.user_id = ${user.id} AND LOWER(q.word) = LOWER(l.word)`;
    const rows = await sql`SELECT id, word, word_type_zh, meaning_zh, details_zh, source_word, created_at FROM study_queue WHERE user_id = ${user.id} ORDER BY created_at DESC`;
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Unable to load study queue", error);
    return NextResponse.json({ error: "Database is not configured" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items.slice(0, 24) : [];
    const sql = await ensureStudyQueueTable();
    await ensureWordsTable();
    let saved = 0;
    for (const item of items) {
      const word = clean(item.word, 120), wordType = clean(item.wordType, 40), meaning = clean(item.meaning, 500);
      const details = clean(item.details, 1000), sourceWord = clean(item.sourceWord, 120);
      if (!word || !wordType || !meaning) continue;
      const learned = await sql`SELECT 1 FROM learned_words WHERE user_id = ${user.id} AND LOWER(word) = LOWER(${word}) LIMIT 1`;
      if (learned.length) continue;
      const existing = await sql`SELECT id FROM study_queue WHERE user_id = ${user.id} AND LOWER(word) = LOWER(${word}) LIMIT 1`;
      if (existing.length) {
        await sql`UPDATE study_queue SET word = ${word}, word_type_zh = ${wordType}, meaning_zh = ${meaning}, details_zh = ${details}, source_word = ${sourceWord}, created_at = NOW() WHERE id = ${existing[0].id} AND user_id = ${user.id}`;
      } else {
        await sql`INSERT INTO study_queue (user_id, word, word_type_zh, meaning_zh, details_zh, source_word) VALUES (${user.id}, ${word}, ${wordType}, ${meaning}, ${details}, ${sourceWord})`;
      }
      saved += 1;
    }
    return NextResponse.json({ saved }, { status: 201 });
  } catch (error) {
    console.error("Unable to save study queue", error);
    return NextResponse.json({ error: "Unable to save study queue" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const sql = await ensureStudyQueueTable();
    await sql`DELETE FROM study_queue WHERE id = ${id} AND user_id = ${user.id}`;
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Unable to remove study item", error);
    return NextResponse.json({ error: "Unable to remove study item" }, { status: 503 });
  }
}
