import { ensureKnowledgeGraphTables } from "@/lib/db";
import { askLanguageModel } from "@/lib/scnet";

const groupTypes = new Set(["语义主题", "词根词族", "近义反义", "词形变化", "常用搭配", "语域", "拼写发音"]);
const clean = (value: unknown, limit = 240) => typeof value === "string" ? value.trim().slice(0, limit) : "";

export async function refreshKnowledgeGraph(userId: number, force = false) {
  const sql = await ensureKnowledgeGraphTables();
  const pending = await sql`SELECT id, word, word_type_zh, meaning_zh, details_zh FROM learned_words WHERE user_id = ${userId} AND knowledge_analyzed_at IS NULL ORDER BY learned_at ASC`;
  if (!force && pending.length < 5) return { updated: 0, pending: pending.length };
  // One model call per request keeps each Vercel invocation safely below 60 seconds.
  const words = pending.slice(0, 8);
  if (!words.length) return { updated: 0, pending: 0 };
  let updated = 0;

  for (let start = 0; start < words.length; start += 8) {
    const batch = words.slice(start, start + 8);
    const existing = await sql`SELECT g.name, g.group_type, g.description_zh, STRING_AGG(w.word, ', ' ORDER BY w.word) AS examples FROM vocabulary_groups g LEFT JOIN vocabulary_group_members m ON m.group_id = g.id LEFT JOIN learned_words w ON w.id = m.word_id WHERE g.user_id = ${userId} GROUP BY g.id ORDER BY g.updated_at DESC LIMIT 30`;
    const result = await askLanguageModel(`Organize these learned French vocabulary items into a clear knowledge graph for a Chinese-speaking learner: ${JSON.stringify(batch.map((item) => ({ word: item.word, wordType: item.word_type_zh, meaning: item.meaning_zh, details: item.details_zh })))}.
Existing reusable groups: ${JSON.stringify(existing)}.
Return exactly {"groups":[{"name":"short Chinese group name","type":"one of 语义主题,词根词族,近义反义,词形变化,常用搭配,语域,拼写发音","description":"concise Chinese explanation","members":[{"word":"exact word from input","relation":"why it belongs, in Chinese","confidence":0.0}]}]}.
Put every input word in 2-4 genuinely useful groups. A word may belong to several groups. Reuse an existing group only when its meaning truly matches. Prefer semantic meaning and real French roots or word families. Do not group by source, learning date, superficial coincidence, or invented etymology. Keep groups distinct, useful, and suitable for revision. Confidence must be between 0 and 1.`, 2200);
    const byWord = new Map(batch.map((item) => [String(item.word).toLocaleLowerCase("fr"), Number(item.id)]));
    const groups = Array.isArray(result.groups) ? result.groups.slice(0, 24) : [];
    for (const rawGroup of groups) {
      const name = clean(rawGroup.name, 60), type = clean(rawGroup.type, 20), description = clean(rawGroup.description, 300);
      if (!name || !groupTypes.has(type) || !Array.isArray(rawGroup.members)) continue;
      const saved = await sql`INSERT INTO vocabulary_groups (user_id, name, group_type, description_zh) VALUES (${userId}, ${name}, ${type}, ${description}) ON CONFLICT (user_id, LOWER(name), group_type) DO UPDATE SET description_zh = EXCLUDED.description_zh, updated_at = NOW() RETURNING id`;
      const groupId = Number(saved[0].id);
      for (const rawMember of rawGroup.members) {
        const wordId = byWord.get(clean(rawMember.word, 120).toLocaleLowerCase("fr"));
        if (!wordId) continue;
        const relation = clean(rawMember.relation, 300);
        const numericConfidence = Number(rawMember.confidence);
        const confidence = Number.isFinite(numericConfidence) ? Math.max(0, Math.min(1, numericConfidence)) : 0.75;
        await sql`INSERT INTO vocabulary_group_members (group_id, word_id, relation_zh, confidence) VALUES (${groupId}, ${wordId}, ${relation}, ${confidence}) ON CONFLICT (group_id, word_id) DO UPDATE SET relation_zh = EXCLUDED.relation_zh, confidence = EXCLUDED.confidence`;
      }
    }
    for (const item of batch) await sql`UPDATE learned_words SET knowledge_analyzed_at = NOW() WHERE id = ${item.id} AND user_id = ${userId}`;
    updated += batch.length;
  }
  const remaining = await sql`SELECT COUNT(*)::int AS count FROM learned_words WHERE user_id = ${userId} AND knowledge_analyzed_at IS NULL`;
  return { updated, pending: Number(remaining[0]?.count || 0) };
}
