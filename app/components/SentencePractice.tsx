"use client";

import { Fragment, ReactNode, useMemo, useState } from "react";

type Vocabulary = { word: string; phonetic: string; wordType: string; meaning: string };
type Result = { title: string; story: string; translation: string; usedWords: Vocabulary[]; newWords: Vocabulary[]; note: string };
type Genre = "melodrama" | "ghost";
const normalize = (value: string) => value.toLocaleLowerCase("fr").replace(/[’]/g, "'");
const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function AnnotatedStory({ text, learned, unknown, onSave }: { text: string; learned: Vocabulary[]; unknown: Vocabulary[]; onSave: (word: Vocabulary, destination: "queue" | "learned") => Promise<void> }) {
  const terms = useMemo(() => [...unknown.map((word) => ({ ...word, unknown: true })), ...learned.map((word) => ({ ...word, unknown: false }))].sort((a, b) => b.word.length - a.word.length), [learned, unknown]);
  if (!terms.length) return <p className="story-text">{text}</p>;
  const pattern = new RegExp(`(${terms.map((item) => escapePattern(item.word).replace(/[’']/g, "[’']")).join("|")})`, "giu");
  const lookup = new Map(terms.map((item) => [normalize(item.word), item]));
  const renderLine = (line: string): ReactNode[] => line.split(pattern).filter(Boolean).map((part, index) => {
    const item = lookup.get(normalize(part));
    if (!item) return <Fragment key={`${index}-${part}`}>{part}</Fragment>;
    return <span className={`story-vocab ${item.unknown ? "unknown" : "learned"}`} key={`${index}-${part}`}>{part}<span className="story-vocab-card" role="tooltip"><strong>{item.word}</strong><small>{item.phonetic || "音标待补充"}</small><span>{item.wordType} · {item.meaning}</span>{item.unknown && <span className="story-vocab-actions"><button onClick={() => onSave(item, "queue")}>加入待学习</button><button onClick={() => onSave(item, "learned")}>标为已学</button></span>}</span></span>;
  });
  return <div className="story-text">{text.split(/\n+/).filter(Boolean).map((line, index) => <p key={index}>{renderLine(line)}</p>)}</div>;
}

export default function SentencePractice({ targetLevel, onUpdated }: { targetLevel: string; onUpdated?: () => void }) {
  const [result, setResult] = useState<Result | null>(null), [genre, setGenre] = useState<Genre>("melodrama"), [showChinese, setShowChinese] = useState(false);
  const [loading, setLoading] = useState(false), [error, setError] = useState(""), [saveStatus, setSaveStatus] = useState("");
  async function generate() {
    setLoading(true); setError(""); setSaveStatus(""); setShowChinese(false);
    try { const response = await fetch("/api/generate-sentence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetLevel, genre }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setResult(data); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "生成失败"); } finally { setLoading(false); }
  }
  async function saveWord(word: Vocabulary, destination: "queue" | "learned") {
    setSaveStatus("");
    const payload = { ...word, sourceWord: `趣味故事：${result?.title ?? ""}` };
    const response = await fetch(destination === "queue" ? "/api/queue" : "/api/words", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(destination === "queue" ? { items: [payload] } : payload) });
    if (!response.ok) { const data = await response.json(); setSaveStatus(data.error || "保存失败"); return; }
    setSaveStatus(destination === "queue" ? `“${word.word}”已加入待学习` : `“${word.word}”已标为已学`);
    setResult((current) => current ? { ...current, newWords: current.newWords.filter((item) => normalize(item.word) !== normalize(word.word)), usedWords: destination === "learned" ? [...current.usedWords, word] : current.usedWords } : current);
    onUpdated?.();
  }
  return <section className="sentence-practice"><div className="explorer-heading"><div><p className="panel-kicker">已学词汇 · {targetLevel}</p><h3>趣味短篇</h3></div><span>SCNet</span></div><p className="sentence-intro">AI 会尽量使用更多已学词汇创作短篇；彩色下划线表示尚未学习的词。</p><div className="story-controls"><div className="story-genres" aria-label="故事类型"><button className={genre === "melodrama" ? "active" : ""} onClick={() => setGenre("melodrama")}>狗血炸裂小说</button><button className={genre === "ghost" ? "active" : ""} onClick={() => setGenre("ghost")}>鬼故事</button></div><button className="sentence-generate" onClick={generate} disabled={loading}>{loading ? "正在创作…" : result ? "换一个故事" : "生成故事"}</button></div>{error && <p className="explorer-error">{error}</p>}{saveStatus && <p className="story-save-status">{saveStatus}</p>}{result && <article className="sentence-result"><div className="used-words"><span>已复用 {result.usedWords.length} 个已学词</span>{result.usedWords.map((word) => <span key={word.word}>{word.word}</span>)}</div><h4>{result.title}</h4><AnnotatedStory text={result.story} learned={result.usedWords} unknown={result.newWords} onSave={saveWord} /><div className="story-translation-heading"><button onClick={() => setShowChinese((value) => !value)}>{showChinese ? "隐藏中文" : "显示中文"}</button></div>{showChinese && <p className="story-translation">{result.translation}</p>}<small>{result.note}</small></article>}</section>;
}
