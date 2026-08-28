"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";

type User = { id: number; email: string };

export default function AuthGate({ children }: { children: (user: User, logout: () => Promise<void>) => ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { fetch("/api/auth").then(async (response) => { if (response.ok) setUser((await response.json()).user); }).finally(() => setLoading(false)); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: registering ? "register" : "login", email, password }) });
    const data = await response.json();
    if (response.ok) setUser(data.user); else setError(data.error || "操作失败");
    setLoading(false);
  }
  async function logout() { await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) }); setUser(null); setPassword(""); }
  if (loading && !user) return <main className="auth-page"><div className="auth-card"><p>正在载入…</p></div></main>;
  if (user) return children(user, logout);
  return <main className="auth-page"><section className="auth-card"><header><span>☾</span><div><h1>For Taxol</h1><p>The choice of moon</p></div></header><div className="auth-copy"><p className="panel-kicker">法语词汇学习</p><h2>{registering ? "创建账户" : "欢迎回来"}</h2><p>登录后，您的学习清单和已学单词将独立保存。</p></div><form onSubmit={submit}><label>邮箱<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={registering ? "new-password" : "current-password"} minLength={8} required /></label>{error && <p className="auth-error">{error}</p>}<button disabled={loading}>{loading ? "请稍候…" : registering ? "注册并登录" : "登录"}</button></form><button className="auth-switch" onClick={() => { setRegistering(!registering); setError(""); }}>{registering ? "已有账户？登录" : "没有账户？注册"}</button></section></main>;
}
