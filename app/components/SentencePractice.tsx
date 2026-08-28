"use client";

import { Fragment, ReactNode, useMemo, useState } from "react";

type Vocabulary = { word: string; phonetic: string; wordType: string; meaning: string; forms?: string[] };
type Result = { format: "sentence" | "story"; title: string; story: string; translation: string; usedWords: Vocabulary[]; newWords: Vocabulary[]; note: string };
type Genre = "melodrama" | "ghost";
type Format = "sentence" | "story";
const normalize = (value: string) => value.toLocaleLowerCase("fr").replace(/[’]/g, "'");
const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function AnnotatedText({ text, learned, unknown, selected, selectionMode, onSelect, onSave }: { text: string; learned: Vocabulary[]; unknown: Vocabulary[]; selected: Vocabulary[]; selectionMode: boolean; onSelect: (word: Vocabulary) => void; onSave: (word: Vocabulary, destination: "queue" | "learned") => Promise<void> }) {
  const { pattern, lookup } = useMemo(() => {
    const items = [...unknown.map((word) => ({ ...word, unknown: true })), ...learned.map((word) => ({ ...word, unknown: false }))];
    const aliases = items.flatMap((item) => Array.from(new Set([item.word, ...(item.forms ?? [])])).filter(Boolean).map((form) => ({ form, item }))).sort((a, b) => b.form.length - a.form.length);
    if (!aliases.length) return { pattern: null, lookup: new Map<string, (typeof items)[number]>() };
    return {
      pattern: new RegExp(`(?<![\\p{L}\\p{M}])(${aliases.map(({ form }) => escapePattern(form).replace(/[’']/g, "[’']")).join("|")})(?![\\p{L}\\p{M}])`, "giu"),
      lookup: new Map(aliases.map(({ form, item }) => [normalize(form), item])),
    };
  }, [learned, unknown]);
  if (!pattern) return <p className="story-text">{text}</p>;
  const selectedSet = new Set(selected.map((item) => normalize(item.word)));
  const renderLine = (line: string): ReactNode[] => line.split(pattern).filter(Boolean).map((part, index) => {
    const item = lookup.get(normalize(part));
    if (!item) return <Fragment key={`${index}-${part}`}>{part}</Fragment>;
    const chosen = selectedSet.has(normalize(item.word));
    const select = () => { if (selectionMode) onSelect(item); };
    return <span className={`story-vocab ${item.unknown ? "unknown" : "learned"} ${chosen ? "selected-next" : ""} ${selectionMode ? "selecting" : ""}`} role={selectionMode ? "button" : undefined} tabIndex={selectionMode ? 0 : undefined} onClick={select} onKeyDown={(event) => { if (selectionMode && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelect(item); } }} key={`${index}-${part}`}>{part}<span className="story-vocab-card" role="tooltip"><strong>{item.word}</strong><small>{item.phonetic || "音标待补充"}</small><span>{item.wordType} · {item.meaning}</span>{item.unknown && <span className="story-vocab-actions"><button onClick={(event) => { event.stopPropagation(); onSave(item, "queue"); }}>加入待学习</button><button onClick={(event) => { event.stopPropagation(); onSave(item, "learned"); }}>标为已学</button></span>}</span></span>;
  });
  return <div className="story-text">{text.split(/\n+/).filter(Boolean).map((line, index) => <p key={index}>{renderLine(line)}</p>)}</div>;
}

export default function SentencePractice({ targetLevel, onUpdated }: { targetLevel: string; onUpdated?: () => void }) {
  const [result, setResult] = useState<Result | null>(null), [genre, setGenre] = useState<Genre>("melodrama"), [format, setFormat] = useState<Format>("story"), [showChinese, setShowChinese] = useState(false);
  const [selectedNext, setSelectedNext] = useState<Vocabulary[]>([]), [selectionMode, setSelectionMode] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(""), [saveStatus, setSaveStatus] = useState("");
  async function generate() {
    setLoading(true); setError(""); setSaveStatus(""); setShowChinese(false);
    try {
      const response = await fetch("/api/generate-sentence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetLevel, genre, format, requiredWords: selectedNext.map((item) => item.word) }) });
      const data: Result & { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error);
      setResult(data);
      setSelectionMode(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "生成失败"); } finally { setLoading(false); }
  }
  function toggleNext(word: Vocabulary) { setSelectedNext((items) => items.some((item) => normalize(item.word) === normalize(word.word)) ? items.filter((item) => normalize(item.word) !== normalize(word.word)) : [...items, word]); }
  async function saveWord(word: Vocabulary, destination: "queue" | "learned") {
    setSaveStatus("");
    const payload = { ...word, sourceWord: `趣味创作：${result?.title || "单句"}` };
    const response = await fetch(destination === "queue" ? "/api/queue" : "/api/words", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(destination === "queue" ? { items: [payload] } : payload) });
    if (!response.ok) { const data = await response.json(); setSaveStatus(data.error || "保存失败"); return; }
    setSaveStatus(destination === "queue" ? `“${word.word}”已加入待学习` : `“${word.word}”已标为已学`);
    if (destination === "learned") setResult((current) => current ? { ...current, newWords: current.newWords.filter((item) => normalize(item.word) !== normalize(word.word)), usedWords: [...current.usedWords, word] } : current);
    onUpdated?.();
  }
  return <section className="sentence-practice"><div className="explorer-heading"><div><p className="panel-kicker">已学词汇 · {targetLevel}</p><h3>趣味创作</h3></div><span>SCNet</span></div><p className="sentence-intro">AI 会尽量复用更多已学词汇；单句最多补充 2 个未学词。彩色下划线表示尚未学习的词，悬停可查看释义。</p><div className="story-options"><div className="story-format" aria-label="文本长度"><button className={format === "sentence" ? "active" : ""} onClick={() => setFormat("sentence")}>一个句子</button><button className={format === "story" ? "active" : ""} onClick={() => setFormat("story")}>短篇故事</button></div><div className="story-genres" aria-label="故事类型"><button className={genre === "melodrama" ? "active" : ""} onClick={() => setGenre("melodrama")}>狗血炸裂</button><button className={genre === "ghost" ? "active" : ""} onClick={() => setGenre("ghost")}>鬼故事</button></div></div>{result && <button className={`story-selection-toggle ${selectionMode ? "active" : ""}`} onClick={() => setSelectionMode((value) => !value)}>{selectionMode ? "完成选择" : "选择词汇"}</button>}{selectionMode && <span className="selection-hint">请直接点击正文中的词汇</span>}{selectedNext.length > 0 && <div className="next-vocabulary"><b>下次优先使用</b>{selectedNext.map((item) => <button key={item.word} onClick={() => toggleNext(item)}>{item.word} ×</button>)}<button onClick={() => setSelectedNext([])}>清空</button></div>}<div className="story-controls"><span>{selectedNext.length ? `已选择 ${selectedNext.length} 个词` : "生成后可选择下次优先使用的词"}</span><button className="sentence-generate" onClick={generate} disabled={loading}>{loading ? "正在创作…" : result ? (format === "sentence" ? "换一个句子" : "换一个故事") : (format === "sentence" ? "生成句子" : "生成故事")}</button></div>{error && <p className="explorer-error">{error}</p>}{saveStatus && <p className="story-save-status">{saveStatus}</p>}{result && <article className="sentence-result"><div className="used-words"><span>已复用 {result.usedWords.length} 个已学词</span>{result.usedWords.map((word) => <span key={word.word}>{word.word}</span>)}</div>{result.title && <h4>{result.title}</h4>}<AnnotatedText text={result.story} learned={result.usedWords} unknown={result.newWords} selected={selectedNext} selectionMode={selectionMode} onSelect={toggleNext} onSave={saveWord} /><div className="story-translation-heading"><button onClick={() => setShowChinese((value) => !value)}>{showChinese ? "隐藏中文" : "显示中文"}</button></div>{showChinese && <p className="story-translation">{result.translation}</p>}<small>{result.note}</small></article>}</section>;
}
