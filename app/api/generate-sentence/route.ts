import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureWordsTable } from "@/lib/db";
import { askLanguageModel } from "@/lib/huggingface";

const allowedLevels = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
const clean = (value: unknown, limit = 800) => typeof value === "string" ? value.trim().slice(0, limit) : "";
export const maxDuration = 40;

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = await request.json(), targetLevel = allowedLevels.has(body.targetLevel) ? body.targetLevel : "B2";
    const sql = await ensureWordsTable();
    const rows = await sql`SELECT word FROM learned_words WHERE user_id = ${user.id} ORDER BY RANDOM() LIMIT 5`;
    const words = rows.map((row) => String(row.word));
    if (words.length < 2) return NextResponse.json({ error: "至少需要两个已学单词才能生成句子" }, { status: 400 });
    const result = await askLanguageModel(`Write one natural modern French sentence suitable for CEFR ${targetLevel}, using all these learned vocabulary items exactly or in a grammatically inflected form: ${JSON.stringify(words)}. Return exactly JSON: {"sentence":"French sentence","translation":"accurate Simplified Chinese translation","usedWords":["items actually used"],"note":"one concise Simplified Chinese grammar or usage note"}. Do not add other text.`, 700);
    const response = { sentence: clean(result.sentence), translation: clean(result.translation), usedWords: Array.isArray(result.usedWords) ? result.usedWords.map((item: unknown) => clean(item, 120)).filter(Boolean) : words, note: clean(result.note) };
    if (!response.sentence || !response.translation) throw new Error("Incomplete sentence");
    return NextResponse.json(response);
  } catch (error) { console.error("Unable to generate sentence", error); return NextResponse.json({ error: "句子生成失败，请重试" }, { status: 502 }); }
}
