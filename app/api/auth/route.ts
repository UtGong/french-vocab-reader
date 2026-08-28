import { NextResponse } from "next/server";
import { clearSession, createSession, getCurrentUser, hashPassword, normalizeEmail, validEmail, verifyPassword } from "@/lib/auth";
import { ensureAuthTables } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  return user ? NextResponse.json({ user }) : NextResponse.json({ user: null }, { status: 401 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.action === "logout") { await clearSession(); return NextResponse.json({ success: true }); }
    const email = normalizeEmail(body.email), password = typeof body.password === "string" ? body.password : "";
    if (!validEmail(email) || password.length < 8 || password.length > 128) return NextResponse.json({ error: "请输入有效邮箱，密码至少 8 位" }, { status: 400 });
    const sql = await ensureAuthTables();
    const existing = await sql`SELECT id, password_hash FROM app_users WHERE email = ${email} LIMIT 1`;
    let userId: number;
    if (body.action === "register") {
      if (existing.length) return NextResponse.json({ error: "此邮箱已注册" }, { status: 409 });
      const rows = await sql`INSERT INTO app_users (email, password_hash) VALUES (${email}, ${hashPassword(password)}) RETURNING id`;
      userId = Number(rows[0].id);
    } else if (body.action === "login") {
      if (!existing.length || !verifyPassword(password, String(existing[0].password_hash))) return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
      userId = Number(existing[0].id);
    } else return NextResponse.json({ error: "无效操作" }, { status: 400 });
    await createSession(userId);
    return NextResponse.json({ user: { id: userId, email } });
  } catch (error) {
    console.error("Authentication failed", error);
    return NextResponse.json({ error: "登录服务暂时不可用" }, { status: 503 });
  }
}
