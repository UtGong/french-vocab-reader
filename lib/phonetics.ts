import { ensureStudyQueueTable, ensureWordsTable } from "@/lib/db";
import { lookupFrenchChinese } from "@/lib/lexicala";

const keyOf = (value: string) => value.trim().toLocaleLowerCase("fr");
const asIpa = (value: unknown) => {
  if (typeof value !== "string") return "";
  const phonetic = value.trim().replace(/^\//, "").replace(/\/$/, "").replace(/^\[/, "").replace(/\]$/, "").trim().slice(0, 120);
  return phonetic ? `/${phonetic}/` : "";
};
type WiktPronunciation = { lang_code?: unknown; sounds?: unknown };
type WiktSound = { ipa?: unknown; tags?: unknown };

/** Look up a real French Wiktionary transcription; never infer IPA from spelling. */
export async function lookupFrenchIpaFromWiktApi(word: string): Promise<string> {
  const url = new URL(`https://api.wiktapi.dev/v1/en/word/${encodeURIComponent(word)}/pronunciations`);
  url.searchParams.set("lang", "fr");
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (response.status === 404) return "";
  if (!response.ok) throw new Error(`WiktApi returned ${response.status}`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object") return "";
  const pronunciations = (payload as { pronunciations?: unknown }).pronunciations;
  if (!Array.isArray(pronunciations)) return "";
  const candidates = pronunciations
    .filter((item): item is WiktPronunciation => Boolean(item) && typeof item === "object" && (item as WiktPronunciation).lang_code === "fr")
    .flatMap((item) => Array.isArray(item.sounds) ? item.sounds as WiktSound[] : [])
    .filter((sound) => typeof sound?.ipa === "string" && Boolean(asIpa(sound.ipa)));
  // Prefer the unmarked standard entry over regional variants.
  candidates.sort((left, right) => {
    const score = (sound: WiktSound) => {
      const tags = Array.isArray(sound.tags) ? sound.tags.map(String).join(" ").toLowerCase() : "";
      return tags ? (tags.includes("france") ? 1 : 2) : 0;
    };
    return score(left) - score(right);
  });
  return candidates.length ? asIpa(candidates[0].ipa) : "";
}

async function concurrent<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await task(items[index]);
    }
  }));
}

export async function generateFrenchPhonetics(input: string[]) {
  const words = Array.from(new Map(input.map((word) => [keyOf(word), word.trim()])).values()).filter(Boolean);
  const pronunciations = new Map<string, string>();

  // WiktApi is keyless and its French Wiktionary entries provide dictionary IPA.
  // Prefer this over generated transcriptions, which can be plausible but wrong.
  await concurrent(words, 6, async (word) => {
    try {
      const phonetic = await lookupFrenchIpaFromWiktApi(word);
      if (phonetic) pronunciations.set(keyOf(word), phonetic);
    } catch (error) { console.warn(`WiktApi pronunciation unavailable for ${word}`, error); }
  });

  const missingFromWikt = words.filter((word) => !pronunciations.has(keyOf(word)));
  if (process.env.LEXICALA_API_KEY && missingFromWikt.length) {
    await concurrent(missingFromWikt, 8, async (word) => {
      try {
        const entry = await lookupFrenchChinese(word);
        const phonetic = asIpa(entry?.phonetic);
        if (phonetic) pronunciations.set(keyOf(word), phonetic);
      } catch (error) { console.warn(`Lexicala pronunciation unavailable for ${word}`, error); }
    });
  }

  return pronunciations;
}

export async function backfillUserPhonetics(userId: number, words: string[]) {
  const pronunciations = await generateFrenchPhonetics(words);
  const sql = await ensureStudyQueueTable();
  await ensureWordsTable();
  const updates = Array.from(pronunciations.entries());
  await concurrent(updates, 20, async ([key, phonetic]) => {
    await Promise.all([
      sql`UPDATE learned_words SET phonetic = ${phonetic} WHERE user_id = ${userId} AND LOWER(word) = ${key} AND (phonetic IS NULL OR phonetic = '')`,
      sql`UPDATE study_queue SET phonetic = ${phonetic} WHERE user_id = ${userId} AND LOWER(word) = ${key} AND (phonetic IS NULL OR phonetic = '')`,
    ]);
  });
  return { updated: updates.length, missing: words.length - updates.length, pronunciations: Object.fromEntries(updates) };
}
