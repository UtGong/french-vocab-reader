import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureStudyQueueTable, ensureWordsTable } from "@/lib/db";
import { backfillUserPhonetics } from "@/lib/phonetics";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const providersConfigured = {
      wiktapi: true,
      lexicala: Boolean(process.env.LEXICALA_API_KEY),
      scnet: Boolean(process.env.SCNET_API_KEY),
    };
    const sql = await ensureStudyQueueTable();
    await ensureWordsTable();
    const [learned, queued] = await Promise.all([
      sql`SELECT word FROM learned_words WHERE user_id = ${user.id} AND (phonetic IS NULL OR phonetic = '')`,
      sql`SELECT word FROM study_queue WHERE user_id = ${user.id} AND (phonetic IS NULL OR phonetic = '')`,
    ]);
    const body = await request.json().catch(() => ({}));
    const excluded = new Set(Array.isArray(body.excludeWords) ? body.excludeWords.filter((word: unknown): word is string => typeof word === "string").map((word: string) => word.toLocaleLowerCase("fr")) : []);
    const storedWords = Array.from(new Map([...learned, ...queued].map((row) => [String(row.word).toLocaleLowerCase("fr"), String(row.word)])).values());
    const retryWord = typeof body.retryWord === "string" ? body.retryWord.trim().slice(0, 120) : "";
    const words = Array.from(new Map([...(retryWord ? [retryWord] : []), ...storedWords].map((word) => [word.toLocaleLowerCase("fr"), word])).values());
    const batch = words.filter((word) => !excluded.has(word.toLocaleLowerCase("fr"))).slice(0, 12);
    const backfill = batch.length ? await backfillUserPhonetics(user.id, batch) : { updated: 0, missing: 0, pronunciations: {} };
    const [remainingLearned, remainingQueued] = await Promise.all([
      sql`SELECT word FROM learned_words WHERE user_id = ${user.id} AND (phonetic IS NULL OR phonetic = '')`,
      sql`SELECT word FROM study_queue WHERE user_id = ${user.id} AND (phonetic IS NULL OR phonetic = '')`,
    ]);
    const stillMissing = Array.from(new Map([...remainingLearned, ...remainingQueued].map((row) => [String(row.word).toLocaleLowerCase("fr"), String(row.word)])).values());
    const storedKeys = new Set(storedWords.map((word) => word.toLocaleLowerCase("fr")));
    const generatedKeys = new Set(Object.keys(backfill.pronunciations).map((word) => word.toLocaleLowerCase("fr")));
    const failedWords = batch.filter((word) => storedKeys.has(word.toLocaleLowerCase("fr"))
      ? stillMissing.some((missing) => missing.toLocaleLowerCase("fr") === word.toLocaleLowerCase("fr"))
      : !generatedKeys.has(word.toLocaleLowerCase("fr")));
    return NextResponse.json({ queued: words.length, processed: batch.length, updated: batch.length - failedWords.length, failedWords, remaining: stillMissing.length, providersConfigured, pronunciations: backfill.pronunciations });
  } catch (error) {
    console.error("Unable to start IPA backfill", error);
    return NextResponse.json({ error: "无法开始音标补全" }, { status: 503 });
  }
}
