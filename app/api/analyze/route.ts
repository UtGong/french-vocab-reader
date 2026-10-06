import { NextResponse } from "next/server";
import { askLanguageModel } from "@/lib/scnet";
import { getCurrentUser } from "@/lib/auth";
import { getCefrLevel } from "@/lib/cefr-lexicon";
import { lookupFrenchChinese } from "@/lib/lexicala";
import { lookupFrenchIpaFromWiktApi } from "@/lib/phonetics";

const allowedTypes = ["名词", "动词", "代词", "形容词", "副词", "介词", "连词", "冠词", "数词", "感叹词", "短语", "其他"];
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    if (!(await getCurrentUser())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = await request.json();
    const word = typeof body.word === "string" ? body.word.trim() : "";
    if (!word || word.length > 120) return NextResponse.json({ error: "Invalid word" }, { status: 400 });
    let wiktPhonetic = "";
    try { wiktPhonetic = await lookupFrenchIpaFromWiktApi(word); }
    catch (error) { console.warn("WiktApi pronunciation unavailable; continuing dictionary lookup", error); }
    try {
      const lexicala = await lookupFrenchChinese(word);
      if (lexicala) return NextResponse.json({ ...lexicala, phonetic: wiktPhonetic || lexicala.phonetic, cefrLevel: getCefrLevel(lexicala.word) || getCefrLevel(word) || "未收录" });
    } catch (error) { console.warn("Lexicala lookup unavailable; using SCNet fallback", error); }
    const result = await askLanguageModel(`Analyze the French vocabulary item ${JSON.stringify(word)}. Return exactly {"word":"correct French spelling","wordType":"one Chinese label from 名词,动词,代词,形容词,副词,介词,连词,冠词,数词,感叹词,短语,其他","meaning":"concise Simplified Chinese meaning"}. Use its most common modern French sense.`, 240);
    const wordType = allowedTypes.includes(result.wordType) ? result.wordType : "其他";
    const meaning = typeof result.meaning === "string" ? result.meaning.trim().slice(0, 500) : "";
    if (!meaning) throw new Error("Model response had no meaning");
    return NextResponse.json({ word: typeof result.word === "string" ? result.word.trim().slice(0, 120) : word, phonetic: wiktPhonetic, wordType, meaning, cefrLevel: getCefrLevel(word) || "未收录", source: wiktPhonetic ? "WiktApi + SCNet" : "SCNet" });
  } catch (error) {
    console.error("Unable to analyze French word", error);
    return NextResponse.json({ error: "Unable to analyze word" }, { status: 502 });
  }
}
