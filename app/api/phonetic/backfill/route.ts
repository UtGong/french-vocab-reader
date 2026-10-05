import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureStudyQueueTable, ensureWordsTable } from "@/lib/db";
import { backfillUserPhonetics } from "@/lib/phonetics";

export const maxDuration = 60;

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const sql = await ensureStudyQueueTable();
    await ensureWordsTable();
    const [learned, queued] = await Promise.all([
      sql`SELECT word FROM learned_words WHERE user_id = ${user.id} AND (phonetic IS NULL OR phonetic = '')`,
      sql`SELECT word FROM study_queue WHERE user_id = ${user.id} AND (phonetic IS NULL OR phonetic = '')`,
    ]);
    const words = Array.from(new Map([...learned, ...queued].map((row) => [String(row.word).toLocaleLowerCase("fr"), String(row.word)])).values());
    if (words.length) after(async () => {
      try { await backfillUserPhonetics(user.id, words); }
      catch (error) { console.error("Unable to backfill French IPA", error); }
    });
    return NextResponse.json({ queued: words.length });
  } catch (error) {
    console.error("Unable to start IPA backfill", error);
    return NextResponse.json({ error: "无法开始音标补全" }, { status: 503 });
  }
}
