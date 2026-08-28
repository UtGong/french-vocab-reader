import { NextResponse } from "next/server";
import { askLanguageModel } from "@/lib/huggingface";
import { getCurrentUser } from "@/lib/auth";
import { getCefrLevel, getCefrPromptContext, isAtOrBelowTarget } from "@/lib/cefr-lexicon";

const clean = (value: unknown, limit = 500) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const allowedLevels = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    if (!(await getCurrentUser())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = await request.json();
    const word = clean(body.word, 120);
    const targetLevel = allowedLevels.has(body.targetLevel) ? body.targetLevel : "B2";
    if (!word) return NextResponse.json({ error: "Invalid word" }, { status: 400 });
    const cefrContext = getCefrPromptContext(word, targetLevel);
    const result = await askLanguageModel(`Create a reliable learning card for the French vocabulary item ${JSON.stringify(word)} for a Chinese-speaking learner preparing for the CEFR ${targetLevel} French exam. FLELex database context: ${JSON.stringify(cefrContext)}.
Return exactly this JSON shape:
{"word":"correct French spelling","phonetic":"French IPA in /slashes/","wordType":"Chinese part of speech","meaning":"concise Simplified Chinese meaning","relatedWords":[{"word":"French item","phonetic":"IPA","relationship":"concise relationship in Chinese","wordType":"Chinese part of speech","meaning":"Simplified Chinese meaning"}],"synonyms":[{"word":"French synonym","phonetic":"IPA","wordType":"Chinese part of speech","meaning":"Simplified Chinese meaning","difference":"precise nuance versus the original in Simplified Chinese"}],"patternWords":[{"word":"French word","phonetic":"IPA","pattern":"shared prefix or suffix explained in Chinese","wordType":"Chinese part of speech","meaning":"Simplified Chinese meaning"}]}.
Give 3-6 useful related words, 4-7 close synonyms, and 4-8 real French words sharing a notable spelling pattern. Prioritize words, meanings, collocations, register distinctions, and nuances that are useful and realistically expected at CEFR ${targetLevel}; avoid unnecessarily elementary or overly advanced suggestions unless needed to explain the input. Pattern words should share a useful beginning such as frin-/fri- or the same ending; they do not need to be semantically related, so never label them as a word family unless that is true. Label the exact prefix or suffix. Do not claim a shared word family unless it is real. Preserve accents, gender markers, and reflexive pronouns. For adjectives, include feminine form when irregular. Do not include examples or unrelated tables.`, 2100);

    const enrich = (item: Record<string, unknown>) => ({ word: clean(item.word, 120), phonetic: clean(item.phonetic, 120), wordType: clean(item.wordType, 40), meaning: clean(item.meaning), cefrLevel: getCefrLevel(clean(item.word, 120)) || "未收录" });
    const relatedWords = Array.isArray(result.relatedWords) ? result.relatedWords.slice(0, 10).map((item: Record<string, unknown>) => ({ ...enrich(item), relationship: clean(item.relationship) })).filter((item: { word: string; meaning: string }) => item.word && item.meaning && isAtOrBelowTarget(item.word, targetLevel)) : [];
    const synonyms = Array.isArray(result.synonyms) ? result.synonyms.slice(0, 10).map((item: Record<string, unknown>) => ({ ...enrich(item), difference: clean(item.difference) })).filter((item: { word: string; meaning: string }) => item.word && item.meaning && isAtOrBelowTarget(item.word, targetLevel)) : [];
    const patternWords = Array.isArray(result.patternWords) ? result.patternWords.slice(0, 12).map((item: Record<string, unknown>) => ({ ...enrich(item), pattern: clean(item.pattern) })).filter((item: { word: string; meaning: string; pattern: string }) => item.word && item.meaning && item.pattern && isAtOrBelowTarget(item.word, targetLevel)) : [];
    const response = { word: clean(result.word, 120) || word, phonetic: clean(result.phonetic, 120), wordType: clean(result.wordType, 40), meaning: clean(result.meaning), cefrLevel: getCefrLevel(word) || "未收录", relatedWords, synonyms, patternWords };
    if (!response.wordType || !response.meaning) throw new Error("Model returned incomplete data");
    return NextResponse.json(response);
  } catch (error) {
    console.error("Unable to explore French vocabulary", error);
    return NextResponse.json({ error: "Unable to generate vocabulary connections" }, { status: 502 });
  }
}
