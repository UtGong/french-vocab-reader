import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { ensureAuthTables } from "@/lib/db";

const COOKIE_NAME = "taxol_session";
const SESSION_DAYS = 30;

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 254) : "";
}

export function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex"), actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const sql = await ensureAuthTables();
  await sql`INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (${userId}, ${tokenHash(token)}, NOW() + INTERVAL '30 days')`;
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_DAYS * 24 * 60 * 60 });
}

export async function clearSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) { const sql = await ensureAuthTables(); await sql`DELETE FROM user_sessions WHERE token_hash = ${tokenHash(token)}`; }
  jar.delete(COOKIE_NAME);
}

export async function getCurrentUser() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const sql = await ensureAuthTables();
  const rows = await sql`SELECT u.id, u.email FROM app_users u JOIN user_sessions s ON s.user_id = u.id WHERE s.token_hash = ${tokenHash(token)} AND s.expires_at > NOW() LIMIT 1`;
  return rows[0] ? { id: Number(rows[0].id), email: String(rows[0].email) } : null;
}
