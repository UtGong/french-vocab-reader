"use client";

import { useState } from "react";

type Result = { sentence: string; translation: string; usedWords: string[]; note: string };
export default function SentencePractice({ targetLevel }: { targetLevel: string }) {
  const [result, setResult] = useState<Result | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
  async function generate() {
    setLoading(true); setError("");
    try { const response = await fetch("/api/generate-sentence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetLevel }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setResult(data); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "生成失败"); } finally { setLoading(false); }
  }
  return <section className="sentence-practice"><div className="explorer-heading"><div><p className="panel-kicker">已学词汇 · {targetLevel}</p><h3>随机造句</h3></div><span>SCNet</span></div><p className="sentence-intro">随机选取数个已学单词，生成符合目标等级的自然法语句子。</p><button className="sentence-generate" onClick={generate} disabled={loading}>{loading ? "正在生成…" : result ? "换一个句子" : "生成句子"}</button>{error && <p className="explorer-error">{error}</p>}{result && <article className="sentence-result"><div className="used-words">{result.usedWords.map((word) => <span key={word}>{word}</span>)}</div><blockquote>{result.sentence}</blockquote><p>{result.translation}</p><small>{result.note}</small></article>}</section>;
}
