import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureStudyQueueTable, ensureWordsTable } from "@/lib/db";
import { refreshKnowledgeGraph } from "@/lib/knowledge-graph";

export const maxDuration = 60;
const clean = (value: unknown, limit: number) => typeof value === "string" ? value.trim().slice(0, limit) : "";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = await request.json();
    const target = body.target === "learned" ? "learned" : body.target === "queue" ? "queue" : null;
    if (!target) return NextResponse.json({ error: "请选择导入到已学或待学习" }, { status: 400 });
    const input = Array.isArray(body.items) ? body.items.slice(0, 300) : [];
    if (!input.length) return NextResponse.json({ error: "没有可导入的词条" }, { status: 400 });
    const unique = new Map<string, { word: string; phonetic: string; wordType: string; meaning: string; details: string; sourceWord: string }>();
    for (const raw of input) {
      const word = clean(raw.word, 120), meaning = clean(raw.meaning, 500), wordType = clean(raw.wordType, 40);
      if (!word || !meaning || !wordType) continue;
      unique.set(word.toLocaleLowerCase("fr"), { word, meaning, wordType, phonetic: clean(raw.phonetic, 120), details: clean(raw.details, 1000), sourceWord: clean(raw.sourceWord, 120) || "Word 文档导入" });
    }
    if (!unique.size) return NextResponse.json({ error: "词条缺少原型、词性或中文意思" }, { status: 400 });
    const sql = await ensureStudyQueueTable();
    await ensureWordsTable();
    let saved = 0, skipped = input.length - unique.size;
    for (const item of unique.values()) {
      if (target === "learned") {
        const old = await sql`SELECT id FROM learned_words WHERE user_id = ${user.id} AND LOWER(word) = LOWER(${item.word}) LIMIT 1`;
        if (old.length) {
          await sql`UPDATE learned_words SET word = ${item.word}, phonetic = CASE WHEN ${item.phonetic} = '' THEN phonetic ELSE ${item.phonetic} END, word_type_zh = ${item.wordType}, meaning_zh = ${item.meaning}, details_zh = ${item.details}, source_word = ${item.sourceWord} WHERE id = ${old[0].id} AND user_id = ${user.id}`;
        } else {
          await sql`INSERT INTO learned_words (user_id, word, phonetic, word_type_zh, meaning_zh, details_zh, source_word) VALUES (${user.id}, ${item.word}, ${item.phonetic}, ${item.wordType}, ${item.meaning}, ${item.details}, ${item.sourceWord})`;
        }
        await sql`DELETE FROM study_queue WHERE user_id = ${user.id} AND LOWER(word) = LOWER(${item.word})`;
        saved += 1;
      } else {
        const alreadyLearned = await sql`SELECT 1 FROM learned_words WHERE user_id = ${user.id} AND LOWER(word) = LOWER(${item.word}) LIMIT 1`;
        if (alreadyLearned.length) { skipped += 1; continue; }
        const old = await sql`SELECT id FROM study_queue WHERE user_id = ${user.id} AND LOWER(word) = LOWER(${item.word}) LIMIT 1`;
        if (old.length) {
          await sql`UPDATE study_queue SET word = ${item.word}, phonetic = CASE WHEN ${item.phonetic} = '' THEN phonetic ELSE ${item.phonetic} END, word_type_zh = ${item.wordType}, meaning_zh = ${item.meaning}, details_zh = ${item.details}, source_word = ${item.sourceWord}, created_at = NOW() WHERE id = ${old[0].id} AND user_id = ${user.id}`;
        } else {
          await sql`INSERT INTO study_queue (user_id, word, phonetic, word_type_zh, meaning_zh, details_zh, source_word) VALUES (${user.id}, ${item.word}, ${item.phonetic}, ${item.wordType}, ${item.meaning}, ${item.details}, ${item.sourceWord})`;
        }
        saved += 1;
      }
    }
    const phoneticsQueued = Array.from(unique.values()).filter((item) => !item.phonetic).length;
    if (target === "learned" && saved) after(async () => { try { await refreshKnowledgeGraph(user.id); } catch (error) { console.error("Unable to refresh graph after document import", error); } });
    return NextResponse.json({ saved, skipped, target, phoneticsQueued }, { status: 201 });
  } catch (error) {
    console.error("Unable to import vocabulary document", error);
    return NextResponse.json({ error: "导入失败，请稍后重试" }, { status: 503 });
  }
}
