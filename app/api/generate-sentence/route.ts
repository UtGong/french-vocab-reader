import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureWordsTable } from "@/lib/db";
import { askLanguageModel } from "@/lib/scnet";

const allowedLevels = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
const allowedGenres = new Set(["melodrama", "ghost"]);
const clean = (value: unknown, limit = 2400) => typeof value === "string" ? value.trim().slice(0, limit) : "";
export const maxDuration = 60;
type Vocabulary = { word: string; phonetic: string; wordType: string; meaning: string };

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = await request.json();
    const targetLevel = allowedLevels.has(body.targetLevel) ? body.targetLevel : "B2";
    const genre = allowedGenres.has(body.genre) ? body.genre : "melodrama";
    const sql = await ensureWordsTable();
    const rows = await sql`SELECT word, phonetic, word_type_zh, meaning_zh FROM learned_words WHERE user_id = ${user.id} ORDER BY learned_at DESC`;
    const learned: Vocabulary[] = rows.map((row) => ({ word: String(row.word), phonetic: String(row.phonetic ?? ""), wordType: String(row.word_type_zh), meaning: String(row.meaning_zh) }));
    if (learned.length < 2) return NextResponse.json({ error: "至少需要两个已学单词才能生成故事" }, { status: 400 });
    const candidates = learned.slice(0, 120);
    const genreInstruction = genre === "ghost" ? "an atmospheric, suspenseful ghost story with a surprising ending, but no graphic gore" : "an exaggerated, fast-moving melodramatic romance with betrayals and a surprising twist";
    const result = await askLanguageModel(`Write an interesting short French story for a CEFR ${targetLevel} learner. Genre: ${genreInstruction}.

AVAILABLE LEARNED VOCABULARY (word, Chinese type and meaning): ${JSON.stringify(candidates)}

Requirements:
1. Write 90-150 French words with a short French title and 2-4 short paragraphs.
2. Reuse as many AVAILABLE LEARNED VOCABULARY items as can fit naturally and grammatically. Do not limit yourself to five. Prefer learned words over outside vocabulary, while keeping the story coherent and lively.
3. You may inflect learned words when French grammar requires it.
4. List every unique French word or fixed phrase used in the story that is NOT in AVAILABLE LEARNED VOCABULARY in newWords, including function words. Give accurate French IPA, Simplified Chinese word type, and concise Chinese meaning for each. Do not include punctuation, numbers, proper names, or inflected forms when their lemma is already learned.
5. usedWords must list the learned vocabulary items actually used.
6. note must be a concise Simplified Chinese explanation of the extra vocabulary needed for natural expression, like “为构成自然表达，补充了……；其余均为指定词汇或功能词”。

Return exactly JSON: {"title":"French title","story":"French story","translation":"accurate complete Simplified Chinese translation","usedWords":["learned item"],"newWords":[{"word":"French lemma or exact phrase","phonetic":"/IPA/","wordType":"Chinese word type","meaning":"concise Chinese meaning"}],"note":"Simplified Chinese usage note"}. No markdown or other text.`, 2400);
    const usedSet = new Set(Array.isArray(result.usedWords) ? result.usedWords.map((item: unknown) => clean(item, 120).toLocaleLowerCase("fr")) : []);
    const usedWords = learned.filter((item) => usedSet.has(item.word.toLocaleLowerCase("fr")));
    const learnedSet = new Set(learned.map((item) => item.word.toLocaleLowerCase("fr")));
    const newWords: Vocabulary[] = Array.isArray(result.newWords) ? result.newWords.slice(0, 80).map((item: Record<string, unknown>) => ({ word: clean(item.word, 120), phonetic: clean(item.phonetic, 120), wordType: clean(item.wordType, 40), meaning: clean(item.meaning, 500) })).filter((item: Vocabulary) => item.word && item.wordType && item.meaning && !learnedSet.has(item.word.toLocaleLowerCase("fr"))) : [];
    const response = { title: clean(result.title, 180), story: clean(result.story), translation: clean(result.translation), usedWords, newWords, note: clean(result.note, 800) };
    if (!response.title || !response.story || !response.translation) throw new Error("Incomplete story");
    return NextResponse.json(response);
  } catch (error) {
    console.error("Unable to generate story", error);
    return NextResponse.json({ error: "故事生成失败，请重试" }, { status: 502 });
  }
}
