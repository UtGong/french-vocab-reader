import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureStudyQueueTable, ensureWordsTable } from "@/lib/db";
import { lookupFrenchChinese } from "@/lib/lexicala";
import { askLanguageModel } from "@/lib/scnet";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = await request.json();
    const word = typeof body.word === "string" ? body.word.trim().slice(0, 120) : "";
    if (!word) return NextResponse.json({ error: "请输入法语单词" }, { status: 400 });

    const sql = await ensureStudyQueueTable();
    await ensureWordsTable();
    const [learned, queued] = await Promise.all([
      sql`SELECT id, phonetic FROM learned_words WHERE user_id = ${user.id} AND LOWER(word) = LOWER(${word}) LIMIT 1`,
      sql`SELECT id, phonetic FROM study_queue WHERE user_id = ${user.id} AND LOWER(word) = LOWER(${word}) LIMIT 1`,
    ]);
    const existing = learned[0] ? { table: "learned_words", row: learned[0] } : queued[0] ? { table: "study_queue", row: queued[0] } : null;
    if (existing?.row.phonetic?.trim()) return NextResponse.json({ word, phonetic: existing.row.phonetic });

    let phonetic = "";
    try { phonetic = (await lookupFrenchChinese(word))?.phonetic ?? ""; } catch (error) { console.warn("Lexicala pronunciation lookup unavailable", error); }
    if (!phonetic) {
      const result = await askLanguageModel(`Give the standard IPA pronunciation of this French word or expression: ${JSON.stringify(word)}. Return exactly JSON: {"phonetic":"IPA enclosed in /slashes/"}. Use French pronunciation, not an English approximation.`, 120);
      phonetic = typeof result.phonetic === "string" ? result.phonetic.trim().slice(0, 120) : "";
      if (phonetic && !phonetic.startsWith("/")) phonetic = `/${phonetic}/`;
    }
    if (!phonetic) return NextResponse.json({ error: "暂时无法取得这个词的音标" }, { status: 502 });

    if (existing) {
      if (existing.table === "learned_words") await sql`UPDATE learned_words SET phonetic = ${phonetic} WHERE id = ${existing.row.id} AND user_id = ${user.id} AND (phonetic IS NULL OR phonetic = '')`;
      else await sql`UPDATE study_queue SET phonetic = ${phonetic} WHERE id = ${existing.row.id} AND user_id = ${user.id} AND (phonetic IS NULL OR phonetic = '')`;
    }
    return NextResponse.json({ word, phonetic });
  } catch (error) {
    console.error("Unable to generate French pronunciation", error);
    return NextResponse.json({ error: "无法生成音标，请稍后重试" }, { status: 503 });
  }
}
