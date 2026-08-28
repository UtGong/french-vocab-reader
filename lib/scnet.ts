const MODEL = process.env.SCNET_MODEL || "DeepSeek-V4-Flash";
const BASE_URL = "https://api.scnet.cn/api/llm/v1";

export async function askLanguageModel(prompt: string, maxTokens = 1200) {
  const token = process.env.SCNET_API_KEY;
  if (!token) throw new Error("SCNET_API_KEY is not configured");

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.15,
      max_tokens: maxTokens,
      top_p: 0.8,
      stream: false,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a careful French lexicographer and French-to-Simplified-Chinese teacher. Return only valid JSON. Never invent a word or an etymological relationship." },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(50000),
  });
  if (!response.ok) throw new Error(`SCNet returned ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("SCNet response had no content");
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(normalized);
  } catch {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("SCNet response was not JSON");
    return JSON.parse(normalized.slice(start, end + 1));
  }
}
