type DeepLResponse = { translations?: Array<{ text?: string }> };

export async function translateFrenchToChinese(text: string) {
  const key = process.env.DEEPL_API_KEY;
  if (!key) throw new Error("DEEPL_API_KEY is not configured");
  const baseUrl = process.env.DEEPL_API_URL || (key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com");
  const response = await fetch(`${baseUrl}/v2/translate`, {
    method: "POST",
    headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: [text], source_lang: "FR", target_lang: "ZH-HANS", preserve_formatting: true }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`DeepL returned ${response.status}: ${await response.text()}`);
  const payload = await response.json() as DeepLResponse;
  const translation = payload.translations?.[0]?.text?.trim();
  if (!translation) throw new Error("DeepL response had no translation");
  return translation;
}
