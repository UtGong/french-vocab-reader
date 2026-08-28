import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureWordsTable } from "@/lib/db";
import { askLanguageModel } from "@/lib/scnet";

const allowedLevels = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
const allowedGenres = new Set(["melodrama", "ghost"]);
const allowedFormats = new Set(["sentence", "story"]);
const clean = (value: unknown, limit = 2400) => typeof value === "string" ? value.trim().slice(0, limit) : "";
export const maxDuration = 60;
type Vocabulary = { word: string; phonetic: string; wordType: string; meaning: string; forms?: string[] };
const forms = (value: unknown, fallback: string) => Array.isArray(value) ? value.map((item) => clean(item, 120)).filter(Boolean).slice(0, 12) : [fallback];
const shuffle = <T,>(items: T[]) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) { const other = Math.floor(Math.random() * (index + 1)); [result[index], result[other]] = [result[other], result[index]]; }
  return result;
};

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = await request.json();
    const targetLevel = allowedLevels.has(body.targetLevel) ? body.targetLevel : "B2";
    const genre = allowedGenres.has(body.genre) ? body.genre : "melodrama";
    const format = allowedFormats.has(body.format) ? body.format : "story";
    const requiredWords = Array.isArray(body.requiredWords) ? body.requiredWords.map((item: unknown) => clean(item, 120)).filter(Boolean).slice(0, 24) : [];
    const avoidWords = new Set(Array.isArray(body.avoidWords) ? body.avoidWords.map((item: unknown) => clean(item, 120).toLocaleLowerCase("fr")).filter(Boolean).slice(0, 120) : []);
    const sql = await ensureWordsTable();
    const rows = await sql`SELECT word, phonetic, word_type_zh, meaning_zh FROM learned_words WHERE user_id = ${user.id} ORDER BY learned_at DESC`;
    const learned: Vocabulary[] = rows.map((row) => ({ word: String(row.word), phonetic: String(row.phonetic ?? ""), wordType: String(row.word_type_zh), meaning: String(row.meaning_zh) }));
    if (learned.length < 2) return NextResponse.json({ error: "至少需要两个已学单词才能生成故事" }, { status: 400 });
    const fresh = shuffle(learned.filter((item) => !avoidWords.has(item.word.toLocaleLowerCase("fr"))));
    const recentlyUsed = shuffle(learned.filter((item) => avoidWords.has(item.word.toLocaleLowerCase("fr"))));
    const candidates = [...fresh, ...recentlyUsed].slice(0, 120);
    const genreInstruction = genre === "ghost" ? "an atmospheric, suspenseful ghost story with a surprising ending, but no graphic gore" : "an exaggerated, fast-moving melodramatic romance with betrayals and a surprising twist";
    const lengthInstruction = format === "sentence" ? "Write exactly one interesting French sentence of 18-35 words. Do not add a title. Use no more than TWO unique words that are outside AVAILABLE LEARNED VOCABULARY; this strict limit includes function words." : "Write 90-150 French words with a short French title and 2-4 short paragraphs.";
    const result = await askLanguageModel(`Write interesting French creative text for a CEFR ${targetLevel} learner. Genre: ${genreInstruction}.

AVAILABLE LEARNED VOCABULARY (word, Chinese type and meaning): ${JSON.stringify(candidates)}
VOCABULARY REQUESTED BY THE USER FOR THIS GENERATION: ${JSON.stringify(requiredWords)}
RECENTLY USED VOCABULARY TO AVOID UNLESS REQUESTED OR NEEDED: ${JSON.stringify(Array.from(avoidWords))}

Requirements:
1. ${lengthInstruction}
2. Reuse as many AVAILABLE LEARNED VOCABULARY items as can fit naturally and grammatically. Do not limit yourself to five. Prefer learned words over outside vocabulary, while keeping the story coherent and lively.
3. Prioritize every item in VOCABULARY REQUESTED BY THE USER and use as many as possible unless that would make French ungrammatical. You may inflect words when grammar requires it.
3a. Rotate vocabulary between generations. Avoid RECENTLY USED VOCABULARY unless it was explicitly requested or the text cannot be natural without it.
4. For EVERY lexical token in the generated French text, provide hover metadata through usedWords or newWords. Do not omit articles, pronouns, auxiliaries, conjunctions, or prepositions.
5. usedWords must contain objects for learned vocabulary actually used. Keep word exactly equal to the database form and put every exact surface form appearing in the French text in forms.
6. newWords must contain each non-learned lemma once, with every exact surface form appearing in the French text in forms, accurate IPA, Simplified Chinese word type, and concise Chinese meaning. Exclude only punctuation, numbers, and proper names.
7. note must be a concise Simplified Chinese explanation of the extra vocabulary needed for natural expression, like “为构成自然表达，补充了……；其余均为指定词汇或功能词”。

Return exactly JSON: {"title":"French title or empty string for sentence format","story":"French text","translation":"accurate complete Simplified Chinese translation","usedWords":[{"word":"exact learned database item","forms":["exact surface form"]}],"newWords":[{"word":"French lemma","forms":["exact surface form"],"phonetic":"/IPA/","wordType":"Chinese word type","meaning":"concise Chinese meaning"}],"note":"Simplified Chinese usage note"}. No markdown or other text.`, format === "sentence" ? 1800 : 4000);
    const usedData = new Map<string, string[]>();
    if (Array.isArray(result.usedWords)) result.usedWords.forEach((item: unknown) => {
      if (typeof item === "string") usedData.set(item.toLocaleLowerCase("fr"), [item]);
      else if (item && typeof item === "object") { const record = item as Record<string, unknown>, word = clean(record.word, 120); if (word) usedData.set(word.toLocaleLowerCase("fr"), forms(record.forms, word)); }
    });
    const usedWords = learned.filter((item) => usedData.has(item.word.toLocaleLowerCase("fr"))).map((item) => ({ ...item, forms: usedData.get(item.word.toLocaleLowerCase("fr")) ?? [item.word] }));
    const learnedSet = new Set(learned.map((item) => item.word.toLocaleLowerCase("fr")));
    const newWords: Vocabulary[] = Array.isArray(result.newWords) ? result.newWords.slice(0, 100).map((item: Record<string, unknown>) => { const word = clean(item.word, 120); return { word, forms: forms(item.forms, word), phonetic: clean(item.phonetic, 120), wordType: clean(item.wordType, 40), meaning: clean(item.meaning, 500) }; }).filter((item: Vocabulary) => item.word && item.wordType && item.meaning && !learnedSet.has(item.word.toLocaleLowerCase("fr"))) : [];
    const response = { format, title: clean(result.title, 180), story: clean(result.story), translation: clean(result.translation), usedWords, newWords, note: clean(result.note, 800) };
    if (!response.story || !response.translation) throw new Error("Incomplete creative text");
    return NextResponse.json(response);
  } catch (error) {
    console.error("Unable to generate story", error);
    return NextResponse.json({ error: "故事生成失败，请重试" }, { status: 502 });
  }
}
