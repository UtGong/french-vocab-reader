const MODEL = "Qwen/Qwen3.5-122B-A10B:cheapest";

export async function askLanguageModel(prompt: string, maxTokens = 1200) {
  const token = process.env.HF_TOKEN;
  if (!token) throw new Error("HF_TOKEN is not configured");

  const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.15,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: "You are a careful French lexicographer and French-to-Simplified-Chinese teacher. Return only valid JSON. Never invent a word or an etymological relationship." },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`Hugging Face returned ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Hugging Face response had no content");
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Hugging Face response was not JSON");
  return JSON.parse(match[0]);
}
