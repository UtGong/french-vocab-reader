import { NextResponse } from "next/server";
import { askLanguageModel } from "@/lib/huggingface";

const allowedTypes = ["名词", "动词", "代词", "形容词", "副词", "介词", "连词", "冠词", "数词", "感叹词", "短语", "其他"];
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const word = typeof body.word === "string" ? body.word.trim() : "";
    if (!word || word.length > 120) return NextResponse.json({ error: "Invalid word" }, { status: 400 });
    const result = await askLanguageModel(`Analyze the French vocabulary item ${JSON.stringify(word)}. Return exactly {"wordType":"one Chinese label from 名词,动词,代词,形容词,副词,介词,连词,冠词,数词,感叹词,短语,其他","meaning":"concise Simplified Chinese meaning"}. Use its most common modern French sense.`, 180);
    const wordType = allowedTypes.includes(result.wordType) ? result.wordType : "其他";
    const meaning = typeof result.meaning === "string" ? result.meaning.trim().slice(0, 500) : "";
    if (!meaning) throw new Error("Model response had no meaning");
    return NextResponse.json({ wordType, meaning });
  } catch (error) {
    console.error("Unable to analyze French word", error);
    return NextResponse.json({ error: "Unable to analyze word" }, { status: 502 });
  }
}
