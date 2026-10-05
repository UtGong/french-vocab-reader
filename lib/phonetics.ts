import { ensureStudyQueueTable, ensureWordsTable } from "@/lib/db";
import { lookupFrenchChinese } from "@/lib/lexicala";
import { askLanguageModel } from "@/lib/scnet";

const keyOf = (value: string) => value.trim().toLocaleLowerCase("fr");
const asIpa = (value: unknown) => {
  if (typeof value !== "string") return "";
  const phonetic = value.trim().slice(0, 120);
  return phonetic && !phonetic.startsWith("/") ? `/${phonetic}/` : phonetic;
};

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

  if (process.env.LEXICALA_API_KEY) {
    await concurrent(words, 12, async (word) => {
      try {
        const entry = await lookupFrenchChinese(word);
        const phonetic = asIpa(entry?.phonetic);
        if (phonetic) pronunciations.set(keyOf(word), phonetic);
      } catch (error) { console.warn(`Lexicala pronunciation unavailable for ${word}`, error); }
    });
  }

  const missing = words.filter((word) => !pronunciations.has(keyOf(word)));
  for (let start = 0; start < missing.length; start += 12) {
    const batch = missing.slice(start, start + 12);
    try {
      const result = await askLanguageModel(`Provide standard French IPA pronunciations for every supplied item. Preserve each spelling exactly. Return exactly {"items":[{"word":"exact supplied spelling","phonetic":"IPA enclosed in /slashes/"}]}. Do not translate, omit, or add words. Items: ${JSON.stringify(batch)}`, 900);
      const entries = Array.isArray(result.items) ? result.items as Array<Record<string, unknown>> : [];
      for (const item of entries) {
        if (typeof item.word !== "string") continue;
        const key = keyOf(item.word);
        if (!batch.some((word) => keyOf(word) === key)) continue;
        const phonetic = asIpa(item.phonetic);
        if (phonetic) pronunciations.set(key, phonetic);
      }
    } catch (error) { console.error("Unable to batch-generate French IPA", error); }
  }

  const stillMissing = words.filter((word) => !pronunciations.has(keyOf(word)));
  await concurrent(stillMissing, 8, async (word) => {
    try {
      const result = await askLanguageModel(`Give the standard French IPA pronunciation of ${JSON.stringify(word)}. Return exactly {"phonetic":"IPA enclosed in /slashes/"}.`, 160);
      const phonetic = asIpa(result.phonetic);
      if (phonetic) pronunciations.set(keyOf(word), phonetic);
    } catch (error) { console.warn(`Unable to generate pronunciation for ${word}`, error); }
  });
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
  return { updated: updates.length, missing: words.length - updates.length };
}
