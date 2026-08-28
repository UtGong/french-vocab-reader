"use client";

import { FormEvent, useMemo, useState } from "react";

type Related = { word: string; phonetic: string; relationship: string; wordType: string; meaning: string; cefrLevel: string };
type Synonym = { word: string; phonetic: string; wordType: string; meaning: string; difference: string; cefrLevel: string };
type PatternWord = { word: string; phonetic: string; pattern: string; wordType: string; meaning: string; cefrLevel: string };
type Exploration = { word: string; phonetic: string; wordType: string; meaning: string; cefrLevel: string; relatedWords: Related[]; synonyms: Synonym[]; patternWords: PatternWord[] };
type Candidate = { key: string; word: string; phonetic: string; wordType: string; meaning: string; details: string; sourceWord: string };

export default function VocabExplorer({ onQueued, targetLevel }: { onQueued: () => void; targetLevel: string }) {
  const [word, setWord] = useState("");
  const [result, setResult] = useState<Exploration | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const [openSections, setOpenSections] = useState<string[]>(["related"]);
  const candidates = useMemo<Candidate[]>(() => result ? [
    { key: "main", word: result.word, phonetic: result.phonetic, wordType: result.wordType, meaning: result.meaning, details: `核心词 · ${result.cefrLevel}`, sourceWord: result.word },
    ...result.relatedWords.map((item, index) => ({ key: `related-${index}`, word: item.word, phonetic: item.phonetic, wordType: item.wordType, meaning: item.meaning, details: `${item.relationship} · ${item.cefrLevel}`, sourceWord: result.word })),
    ...result.synonyms.map((item, index) => ({ key: `synonym-${index}`, word: item.word, phonetic: item.phonetic, wordType: item.wordType, meaning: item.meaning, details: `${item.difference} · ${item.cefrLevel}`, sourceWord: result.word })),
    ...result.patternWords.map((item, index) => ({ key: `pattern-${index}`, word: item.word, phonetic: item.phonetic, wordType: item.wordType, meaning: item.meaning, details: `${item.pattern} · ${item.cefrLevel}`, sourceWord: result.word })),
  ] : [], [result]);

  function toggle(key: string) { setSelected((keys) => keys.includes(key) ? keys.filter((item) => item !== key) : [...keys, key]); }
  async function explore(event: FormEvent) {
    event.preventDefault(); if (!word.trim() || state === "loading") return;
    setState("loading"); setResult(null); setSelected([]); setMessage(""); setOpenSections(["related"]);
    try {
      const response = await fetch("/api/explore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ word: word.trim(), targetLevel }) });
      if (!response.ok) throw new Error();
      setResult(await response.json()); setState("idle");
    } catch { setState("error"); }
  }
  async function addSelected() {
    const items = candidates.filter((item) => selected.includes(item.key));
    if (!items.length) return;
    setState("saving"); setMessage("");
    try {
      const response = await fetch("/api/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
      if (!response.ok) throw new Error();
      const summary = await response.json(); onQueued(); setState("idle"); setMessage(`已将 ${summary.saved} 个新词加入学习清单`);
    } catch { setState("error"); }
  }
  const checkbox = (key: string, label: string) => <input aria-label={`选择 ${label}`} type="checkbox" checked={selected.includes(key)} onChange={() => toggle(key)} />;
  const toggleSection = (section: string) => setOpenSections((sections) => sections.includes(section) ? sections.filter((item) => item !== section) : [...sections, section]);
  const toggleSectionSelection = (keys: string[]) => setSelected((current) => keys.every((key) => current.includes(key)) ? current.filter((key) => !keys.includes(key)) : [...new Set([...current, ...keys])]);
  const sectionHeading = (section: string, title: string, keys: string[]) => <div className="fold-heading"><button type="button" aria-expanded={openSections.includes(section)} onClick={() => toggleSection(section)}><span><b>{title}</b><small>{keys.length} 个词</small></span><i>{openSections.includes(section) ? "收起 −" : "展开 +"}</i></button><button type="button" className="section-select" onClick={() => toggleSectionSelection(keys)}>{keys.every((key) => selected.includes(key)) ? "取消本组" : "全选本组"}</button></div>;

  return <section className="vocab-explorer">
    <div className="explorer-heading"><div><p className="panel-kicker">法语词汇助手 · {targetLevel}</p><h3>词汇联想</h3></div><span>Qwen</span></div>
    <form onSubmit={explore}><label htmlFor="explore-word">输入一个法语词汇</label><div><input id="explore-word" value={word} onChange={(event) => setWord(event.target.value)} placeholder="例如：fringant" autoComplete="off" /><button disabled={state === "loading"}>{state === "loading" ? "分析中…" : "生成相关词"}</button></div></form>
    {state === "error" && <p className="explorer-error">操作失败，请稍后重试。</p>}
    {result && <div className="explorer-result">
      <div className="selection-toolbar"><button onClick={() => setSelected(selected.length === candidates.length ? [] : candidates.map((item) => item.key))}>{selected.length === candidates.length ? "取消全选" : "全选"}</button><button className="add-selected" disabled={!selected.length || state === "saving"} onClick={addSelected}>{state === "saving" ? "正在加入…" : `加入学习清单（${selected.length}）`}</button><button onClick={() => setOpenSections(openSections.length === 3 ? [] : ["related", "synonyms", "patterns"])}>{openSections.length === 3 ? "全部收起" : "全部展开"}</button><span>{message}</span></div>
      <label className="word-summary selectable">{checkbox("main", result.word)}<h4>{result.word}</h4><span>{result.phonetic || result.cefrLevel}</span><p>{result.wordType} · {result.meaning} · {result.cefrLevel}</p></label>
      <section className="fold-section">{sectionHeading("related", "相关词", result.relatedWords.map((_, index) => `related-${index}`))}{openSections.includes("related") && <div className="table-wrap"><table className="selectable-table"><thead><tr><th>选择</th><th>法语</th><th>音标</th><th>等级</th><th>关系</th><th>词性</th><th>中文</th></tr></thead><tbody>{result.relatedWords.map((item, index) => <tr key={`${item.word}-${item.relationship}`}><td>{checkbox(`related-${index}`, item.word)}</td><td>{item.word}</td><td>{item.phonetic || "—"}</td><td>{item.cefrLevel}</td><td>{item.relationship}</td><td>{item.wordType}</td><td>{item.meaning}</td></tr>)}</tbody></table></div>}</section>
      <section className="fold-section">{sectionHeading("synonyms", "近义词与区别", result.synonyms.map((_, index) => `synonym-${index}`))}{openSections.includes("synonyms") && <div className="table-wrap"><table className="selectable-table"><thead><tr><th>选择</th><th>法语</th><th>音标</th><th>等级</th><th>词性</th><th>中文</th><th>细微区别</th></tr></thead><tbody>{result.synonyms.map((item, index) => <tr key={item.word}><td>{checkbox(`synonym-${index}`, item.word)}</td><td>{item.word}</td><td>{item.phonetic || "—"}</td><td>{item.cefrLevel}</td><td>{item.wordType}</td><td>{item.meaning}</td><td>{item.difference}</td></tr>)}</tbody></table></div>}</section>
      <section className="fold-section">{sectionHeading("patterns", "同形词", result.patternWords.map((_, index) => `pattern-${index}`))}{openSections.includes("patterns") && <div className="table-wrap"><table className="selectable-table"><thead><tr><th>选择</th><th>法语</th><th>音标</th><th>等级</th><th>共同形式</th><th>词性</th><th>中文</th></tr></thead><tbody>{result.patternWords.map((item, index) => <tr key={`${item.word}-${item.pattern}`}><td>{checkbox(`pattern-${index}`, item.word)}</td><td>{item.word}</td><td>{item.phonetic || "—"}</td><td>{item.cefrLevel}</td><td>{item.pattern}</td><td>{item.wordType}</td><td>{item.meaning}</td></tr>)}</tbody></table></div>}</section>
    </div>}
  </section>;
}
