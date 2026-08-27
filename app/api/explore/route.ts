import { NextResponse } from "next/server";
import { askLanguageModel } from "@/lib/huggingface";

const clean = (value: unknown, limit = 500) => typeof value === "string" ? value.trim().slice(0, limit) : "";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const word = clean(body.word, 120);
    if (!word) return NextResponse.json({ error: "Invalid word" }, { status: 400 });
    const result = await askLanguageModel(`Create a reliable learning card for the French vocabulary item ${JSON.stringify(word)} for a Chinese-speaking learner.
Return exactly this JSON shape:
{"word":"correct French spelling","wordType":"Chinese part of speech","meaning":"concise Simplified Chinese meaning","relatedWords":[{"word":"French item","relationship":"concise relationship in Chinese","wordType":"Chinese part of speech","meaning":"Simplified Chinese meaning"}],"synonyms":[{"word":"French synonym","wordType":"Chinese part of speech","meaning":"Simplified Chinese meaning","difference":"precise nuance versus the original in Simplified Chinese"}]}.
Give 3-6 useful related or extended words and 4-7 close synonyms when genuinely available. Related words may be morphological, etymological, or strongly associated, but label the exact relationship. Do not claim a shared word family unless it is real. Preserve accents, gender markers, and reflexive pronouns. For adjectives, include feminine form when irregular. Do not include examples or unrelated tables.`, 1500);

    const relatedWords = Array.isArray(result.relatedWords) ? result.relatedWords.slice(0, 8).map((item: Record<string, unknown>) => ({ word: clean(item.word, 120), relationship: clean(item.relationship), wordType: clean(item.wordType, 40), meaning: clean(item.meaning) })).filter((item: { word: string; meaning: string }) => item.word && item.meaning) : [];
    const synonyms = Array.isArray(result.synonyms) ? result.synonyms.slice(0, 8).map((item: Record<string, unknown>) => ({ word: clean(item.word, 120), wordType: clean(item.wordType, 40), meaning: clean(item.meaning), difference: clean(item.difference) })).filter((item: { word: string; meaning: string }) => item.word && item.meaning) : [];
    const response = { word: clean(result.word, 120) || word, wordType: clean(result.wordType, 40), meaning: clean(result.meaning), relatedWords, synonyms };
    if (!response.wordType || !response.meaning) throw new Error("Model returned incomplete data");
    return NextResponse.json(response);
  } catch (error) {
    console.error("Unable to explore French vocabulary", error);
    return NextResponse.json({ error: "Unable to generate vocabulary connections" }, { status: 502 });
  }
}
