"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Entry = { word: string; phonetic: string; wordType: string; meaning: string; cefrLevel: string };
export default function Dictionary() {
  const [word, setWord] = useState(""), [entry, setEntry] = useState<Entry | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const voices = useRef<SpeechSynthesisVoice[]>([]);
  useEffect(() => { const load = () => { voices.current = speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith("fr")); }; load(); speechSynthesis.addEventListener("voiceschanged", load); return () => speechSynthesis.removeEventListener("voiceschanged", load); }, []);
  async function lookup(event: FormEvent) { event.preventDefault(); if (!word.trim()) return; setLoading(true); setError(""); try { const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ word: word.trim() }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setEntry(data); } catch { setError("查询失败，请重试"); } finally { setLoading(false); } }
  function play() { if (!entry) return; const voice = voices.current.find((item) => item.lang.toLowerCase() === "fr-fr") || voices.current[0]; if (!voice) { setError("未找到法语语音，请安装 French / Français 系统语音"); return; } speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(entry.word); utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = .78; speechSynthesis.speak(utterance); }
  return <section className="dictionary"><div className="explorer-heading"><div><p className="panel-kicker">发音与释义</p><h3>法语词典</h3></div></div><form onSubmit={lookup}><input value={word} onChange={(event) => setWord(event.target.value)} placeholder="输入法语单词" autoComplete="off"/><button disabled={loading}>{loading ? "查询中…" : "查询"}</button></form>{error && <p className="explorer-error">{error}</p>}{entry && <article><button className="dictionary-play" onClick={play} aria-label={`播放 ${entry.word}`}>▶</button><div><h4>{entry.word}</h4><span>{entry.phonetic}</span></div><div><b>{entry.wordType}</b><p>{entry.meaning}</p><small>{entry.cefrLevel}</small></div></article>}</section>;
}
