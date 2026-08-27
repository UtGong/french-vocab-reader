import { NextResponse } from "next/server";

const allowedTypes = ["名词", "动词", "代词", "形容词", "副词", "介词", "连词", "冠词", "数词", "其他"];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const word = typeof body.word === "string" ? body.word.trim() : "";
    if (!word || word.length > 120) return NextResponse.json({ error: "Invalid word" }, { status: 400 });

    const token = process.env.VERCEL_OIDC_TOKEN;
    if (!token) return NextResponse.json({ error: "AI authentication is unavailable" }, { status: 503 });
    const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash",
        temperature: 0,
        max_tokens: 100,
        messages: [{ role: "user", content: `Analyze this French word: ${JSON.stringify(word)}. Return only valid JSON with exactly two fields: {"wordType":"one of 名词,动词,代词,形容词,副词,介词,连词,冠词,数词,其他","meaning":"a concise Simplified Chinese meaning"}. Choose the most common meaning in ordinary French.` }],
      }),
    });
    if (!response.ok) throw new Error(`AI Gateway returned ${response.status}`);
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI response was not JSON");
    const result = JSON.parse(match[0]);
    const wordType = allowedTypes.includes(result.wordType) ? result.wordType : "其他";
    const meaning = typeof result.meaning === "string" ? result.meaning.trim().slice(0, 500) : "";
    if (!meaning) throw new Error("AI response had no meaning");
    return NextResponse.json({ wordType, meaning });
  } catch (error) {
    console.error("Unable to analyze French word", error);
    return NextResponse.json({ error: "Unable to analyze word" }, { status: 502 });
  }
}
