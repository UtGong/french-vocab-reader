type JsonRecord = Record<string, unknown>;
const posMap: Record<string, string> = { noun: "名词", verb: "动词", adjective: "形容词", adverb: "副词", pronoun: "代词", preposition: "介词", conjunction: "连词", article: "冠词", determiner: "冠词", numeral: "数词", interjection: "感叹词", phrase: "短语" };
const objects = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object") : value && typeof value === "object" ? [value as JsonRecord] : [];
const texts = (value: unknown): string[] => typeof value === "string" ? [value] : objects(value).flatMap((item) => typeof item.text === "string" ? [item.text] : Object.values(item).flatMap(texts));

function translatedMeanings(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(translatedMeanings);
  const record = value as JsonRecord, found: string[] = [];
  for (const [key, child] of Object.entries(record)) {
    if (key.toLowerCase() === "zh") found.push(...texts(child));
    else if (["translation", "translations", "target"].includes(key.toLowerCase())) {
      for (const item of objects(child)) if (item.language === "zh" || item.lang === "zh" || typeof item.text === "string") found.push(...texts(item));
      found.push(...translatedMeanings(child));
    } else found.push(...translatedMeanings(child));
  }
  return found;
}

function findString(value: unknown, keys: string[]): string {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) { for (const item of value) { const found = findString(item, keys); if (found) return found; } return ""; }
  const record = value as JsonRecord;
  for (const key of keys) if (typeof record[key] === "string") return record[key];
  for (const child of Object.values(record)) { const found = findString(child, keys); if (found) return found; }
  return "";
}

export async function lookupFrenchChinese(word: string) {
  const key = process.env.LEXICALA_API_KEY;
  if (!key) throw new Error("LEXICALA_API_KEY is not configured");
  const url = new URL("https://lexicala1.p.rapidapi.com/translate-to");
  url.search = new URLSearchParams({ text: word, language: "fr", targetLang: "zh", morph: "true", analyzed: "true", source: "global", "page-length": "5" }).toString();
  const response = await fetch(url, { headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": "lexicala1.p.rapidapi.com" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Lexicala returned ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const results = objects((payload as JsonRecord).results ?? payload);
  if (!results.length) return null;
  const first = results[0], headword = objects(first.headword)[0] ?? first;
  const lemma = typeof headword.text === "string" ? headword.text : typeof first.word === "string" ? first.word : word;
  const rawPos = (typeof headword.pos === "string" ? headword.pos : findString(first, ["pos", "part_of_speech"])).toLowerCase();
  const pronunciation = headword.pronunciation ? findString(headword.pronunciation, ["ipa", "text", "value"]) : "";
  const meanings = Array.from(new Set(results.flatMap(translatedMeanings).map((item) => item.trim()).filter(Boolean))).slice(0, 6);
  if (!meanings.length) return null;
  return { word: lemma, phonetic: pronunciation ? (pronunciation.startsWith("/") ? pronunciation : `/${pronunciation}/`) : "", wordType: posMap[rawPos] || "其他", meaning: meanings.join("；"), source: "Lexicala" };
}
