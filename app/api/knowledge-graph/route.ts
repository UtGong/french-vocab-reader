import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureKnowledgeGraphTables } from "@/lib/db";
import { refreshKnowledgeGraph } from "@/lib/knowledge-graph";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const clean = (value: unknown, limit = 240) => typeof value === "string" ? value.trim().slice(0, limit) : "";

async function graphData(userId: number) {
  const sql = await ensureKnowledgeGraphTables();
  const [groups, members, pending] = await Promise.all([
    sql`SELECT id, name, group_type, description_zh FROM vocabulary_groups WHERE user_id = ${userId} ORDER BY group_type, name`,
    sql`SELECT m.group_id, w.id AS word_id, w.word, w.phonetic, w.word_type_zh, w.meaning_zh, w.details_zh, w.source_word, w.learned_at, m.relation_zh, m.confidence FROM vocabulary_group_members m JOIN vocabulary_groups g ON g.id = m.group_id JOIN learned_words w ON w.id = m.word_id WHERE g.user_id = ${userId} ORDER BY w.word`,
    sql`SELECT COUNT(*)::int AS count FROM learned_words WHERE user_id = ${userId} AND knowledge_analyzed_at IS NULL`,
  ]);
  return { groups: groups.map((group) => ({ id: Number(group.id), name: String(group.name), type: String(group.group_type), description: String(group.description_zh), members: members.filter((member) => Number(member.group_id) === Number(group.id)).map((member) => ({ id: Number(member.word_id), word: String(member.word), phonetic: String(member.phonetic), word_type_zh: String(member.word_type_zh), meaning_zh: String(member.meaning_zh), details_zh: String(member.details_zh), source_word: String(member.source_word), learned_at: String(member.learned_at), relation: String(member.relation_zh), confidence: Number(member.confidence) })) })), pending: Number(pending[0]?.count || 0) };
}

export async function GET() {
  try { const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 }); return NextResponse.json(await graphData(user.id)); }
  catch (error) { console.error("Unable to load knowledge graph", error); return NextResponse.json({ error: "无法加载词汇图谱" }, { status: 503 }); }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = await request.json();
    if (body.action === "refresh") { const refresh = await refreshKnowledgeGraph(user.id, body.force === true); return NextResponse.json({ ...await graphData(user.id), refresh }); }
    const sql = await ensureKnowledgeGraphTables();
    if (body.action === "createGroup") {
      const name = clean(body.name, 60), type = clean(body.type, 20), description = clean(body.description, 300);
      if (!name || !type) return NextResponse.json({ error: "分组名称和类型不能为空" }, { status: 400 });
      await sql`INSERT INTO vocabulary_groups (user_id, name, group_type, description_zh) VALUES (${user.id}, ${name}, ${type}, ${description}) ON CONFLICT (user_id, LOWER(name), group_type) DO NOTHING`;
    } else if (body.action === "addMember") {
      const groupId = Number(body.groupId), wordId = Number(body.wordId), relation = clean(body.relation, 300);
      const owned = await sql`SELECT 1 FROM vocabulary_groups g JOIN learned_words w ON w.user_id = g.user_id WHERE g.id = ${groupId} AND w.id = ${wordId} AND g.user_id = ${user.id}`;
      if (!owned.length) return NextResponse.json({ error: "无效分组或词汇" }, { status: 400 });
      await sql`INSERT INTO vocabulary_group_members (group_id, word_id, relation_zh, confidence) VALUES (${groupId}, ${wordId}, ${relation || "用户添加"}, 1) ON CONFLICT (group_id, word_id) DO UPDATE SET relation_zh = EXCLUDED.relation_zh, confidence = 1`;
    }
    return NextResponse.json(await graphData(user.id));
  } catch (error) { console.error("Unable to update knowledge graph", error); return NextResponse.json({ error: "无法更新词汇图谱" }, { status: 503 }); }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = await request.json(), id = Number(body.id), name = clean(body.name, 60), description = clean(body.description, 300);
    if (!id || !name) return NextResponse.json({ error: "无效分组" }, { status: 400 });
    const sql = await ensureKnowledgeGraphTables();
    await sql`UPDATE vocabulary_groups SET name = ${name}, description_zh = ${description}, updated_at = NOW() WHERE id = ${id} AND user_id = ${user.id}`;
    return NextResponse.json(await graphData(user.id));
  } catch { return NextResponse.json({ error: "无法修改分组" }, { status: 503 }); }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const url = new URL(request.url), groupId = Number(url.searchParams.get("groupId")), wordId = Number(url.searchParams.get("wordId"));
    const sql = await ensureKnowledgeGraphTables();
    if (wordId) await sql`DELETE FROM vocabulary_group_members m USING vocabulary_groups g WHERE m.group_id = g.id AND m.group_id = ${groupId} AND m.word_id = ${wordId} AND g.user_id = ${user.id}`;
    else await sql`DELETE FROM vocabulary_groups WHERE id = ${groupId} AND user_id = ${user.id}`;
    return NextResponse.json(await graphData(user.id));
  } catch { return NextResponse.json({ error: "无法删除图谱关系" }, { status: 503 }); }
}
