import { NextResponse } from "next/server";
import { askLanguageModel } from "@/lib/huggingface";

const allowedTypes = ["名词", "动词", "代词", "形容词", "副词", "介词", "连词", "冠词", "数词", "感叹词", "短语", "其他"];
const clean = (value: unknown, limit = 500) => typeof value === "string" ? value.trim().slice(0, limit) : "";
export const maxDuration = 40;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const words: string[] = Array.isArray(body.words) ? [...new Set<string>(body.words.map((word: unknown) => clean(word, 120)).filter((word: string) => Boolean(word)))].slice(0, 80) : [];
    if (!words.length) return NextResponse.json({ error: "No words provided" }, { status: 400 });
    const result = await askLanguageModel(`Analyze every item in this JSON array as modern French vocabulary: ${JSON.stringify(words)}.
Return exactly {"items":[{"word":"exact input item","wordType":"one of 名词,动词,代词,形容词,副词,介词,连词,冠词,数词,感叹词,短语,其他","meaning":"accurate concise Simplified Chinese meaning"}]}.
Return one item per input, in the same order. Determine the part of speech from ordinary French usage. Never use ellipses, placeholders, empty meanings, or explanations outside JSON.`, Math.min(4000, words.length * 55 + 200));
    if (!Array.isArray(result.items)) throw new Error("Model returned no items");
    const items = result.items.map((item: Record<string, unknown>) => ({ word: clean(item.word, 120), wordType: clean(item.wordType, 40), meaning: clean(item.meaning) }))
      .filter((item: { word: string; wordType: string; meaning: string }) => item.word && allowedTypes.includes(item.wordType) && item.meaning && !/^\.{2,}$/.test(item.meaning));
    const returned = new Set(items.map((item: { word: string }) => item.word.toLocaleLowerCase("fr")));
    if (words.some((word) => !returned.has(word.toLocaleLowerCase("fr")))) throw new Error("Model returned incomplete analysis");
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Unable to pre-analyze French text", error);
    return NextResponse.json({ error: "Unable to analyze the complete text" }, { status: 502 });
  }
}
