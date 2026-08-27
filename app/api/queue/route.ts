import { NextResponse } from "next/server";
import { ensureStudyQueueTable } from "@/lib/db";

export const dynamic = "force-dynamic";
const clean = (value: unknown, limit: number) => typeof value === "string" ? value.trim().slice(0, limit) : "";

export async function GET() {
  try {
    const sql = await ensureStudyQueueTable();
    const rows = await sql`SELECT id, word, word_type_zh, meaning_zh, details_zh, source_word, created_at FROM study_queue ORDER BY created_at DESC`;
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Unable to load study queue", error);
    return NextResponse.json({ error: "Database is not configured" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items.slice(0, 24) : [];
    const sql = await ensureStudyQueueTable();
    let saved = 0;
    for (const item of items) {
      const word = clean(item.word, 120), wordType = clean(item.wordType, 40), meaning = clean(item.meaning, 500);
      const details = clean(item.details, 1000), sourceWord = clean(item.sourceWord, 120);
      if (!word || !wordType || !meaning) continue;
      await sql`INSERT INTO study_queue (word, word_type_zh, meaning_zh, details_zh, source_word)
        VALUES (${word}, ${wordType}, ${meaning}, ${details}, ${sourceWord})
        ON CONFLICT (word) DO UPDATE SET word_type_zh = EXCLUDED.word_type_zh, meaning_zh = EXCLUDED.meaning_zh,
          details_zh = EXCLUDED.details_zh, source_word = EXCLUDED.source_word, created_at = NOW()`;
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
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const sql = await ensureStudyQueueTable();
    await sql`DELETE FROM study_queue WHERE id = ${id}`;
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Unable to remove study item", error);
    return NextResponse.json({ error: "Unable to remove study item" }, { status: 503 });
  }
}
