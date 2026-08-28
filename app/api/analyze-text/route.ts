import { NextResponse } from "next/server";
import { askLanguageModel } from "@/lib/scnet";
import { getCurrentUser } from "@/lib/auth";

const allowedTypes = ["名词", "动词", "代词", "形容词", "副词", "介词", "连词", "冠词", "数词", "感叹词", "短语", "其他"];
const allowedLevels = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
const clean = (value: unknown, limit = 500) => typeof value === "string" ? value.trim().slice(0, limit) : "";
type AnalyzedItem = { word: string; isFrench: boolean; phonetic: string; wordType: string; meaning: string; lemma: string; lemmaPhonetic: string; lemmaWordType: string; lemmaMeaning: string };
export const maxDuration = 40;

export async function POST(request: Request) {
  try {
    if (!(await getCurrentUser())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = await request.json();
    const targetLevel = allowedLevels.has(body.targetLevel) ? body.targetLevel : "B2";
    const words: string[] = Array.isArray(body.words) ? [...new Set<string>(body.words.map((word: unknown) => clean(word, 120)).filter((word: string) => Boolean(word)))].slice(0, 24) : [];
    if (!words.length) return NextResponse.json({ error: "No words provided" }, { status: 400 });
    const result = await askLanguageModel(`Classify and analyze every token in this JSON array for a learner preparing for the CEFR ${targetLevel} French exam: ${JSON.stringify(words)}.
Return exactly {"items":[{"word":"exact input token","isFrench":true,"phonetic":"French IPA enclosed in /slashes/","wordType":"one of 名词,动词,代词,形容词,副词,介词,连词,冠词,数词,感叹词,短语,其他","meaning":"concise Simplified Chinese meaning","lemma":"French dictionary headword","lemmaPhonetic":"lemma IPA enclosed in /slashes/","lemmaWordType":"Chinese part-of-speech label","lemmaMeaning":"concise Simplified Chinese lemma meaning"}]}.
Return exactly one item per input in the same order. Set isFrench false for English, Chinese, other non-French words, gibberish, URLs, and standalone names that are not useful French vocabulary; their other fields may be empty. For valid French, preserve the exact input in word. Put its dictionary lemma in lemma: infinitive for a conjugated verb, masculine singular for an inflected adjective, and singular dictionary form for an inflected noun. Example: grises has lemma gris. If the input is already the dictionary form, repeat it as lemma. Choose meanings relevant to a ${targetLevel} exam. Never use placeholders or text outside JSON.`, Math.min(4000, words.length * 110 + 300));
    if (!Array.isArray(result.items)) throw new Error("Model returned no items");
    const analyzed: AnalyzedItem[] = result.items.map((item: Record<string, unknown>): AnalyzedItem => ({ word: clean(item.word, 120), isFrench: item.isFrench === true, phonetic: clean(item.phonetic, 120), wordType: clean(item.wordType, 40), meaning: clean(item.meaning), lemma: clean(item.lemma, 120), lemmaPhonetic: clean(item.lemmaPhonetic, 120), lemmaWordType: clean(item.lemmaWordType, 40), lemmaMeaning: clean(item.lemmaMeaning) }));
    const returned = new Set(analyzed.map((item: { word: string }) => item.word.toLocaleLowerCase("fr")));
    if (words.some((word) => !returned.has(word.toLocaleLowerCase("fr")))) throw new Error("Model returned incomplete analysis");
    const expanded: Array<{ word: string; phonetic: string; wordType: string; meaning: string; details: string }> = [];
    analyzed.forEach((item) => {
      if (!item.isFrench || !item.word || !allowedTypes.includes(item.wordType) || !item.meaning) return;
      expanded.push({ word: item.word, phonetic: item.phonetic, wordType: item.wordType, meaning: item.meaning, details: "原文形式" });
      if (item.lemma && item.lemma.toLocaleLowerCase("fr") !== item.word.toLocaleLowerCase("fr") && allowedTypes.includes(item.lemmaWordType) && item.lemmaMeaning) expanded.push({ word: item.lemma, phonetic: item.lemmaPhonetic, wordType: item.lemmaWordType, meaning: item.lemmaMeaning, details: `原形（来自 ${item.word}）` });
    });
    const items = Array.from(new Map(expanded.map((item) => [item.word.toLocaleLowerCase("fr"), item])).values());
    return NextResponse.json({ items, ignored: words.length - analyzed.filter((item) => item.isFrench).length });
  } catch (error) {
    console.error("Unable to pre-analyze French text", error);
    return NextResponse.json({ error: "Unable to analyze the complete text" }, { status: 502 });
  }
}
