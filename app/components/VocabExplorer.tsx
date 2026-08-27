"use client";

import { FormEvent, useState } from "react";

type Related = { word: string; relationship: string; wordType: string; meaning: string };
type Synonym = { word: string; wordType: string; meaning: string; difference: string };
type Exploration = { word: string; wordType: string; meaning: string; relatedWords: Related[]; synonyms: Synonym[] };

export default function VocabExplorer() {
  const [word, setWord] = useState("");
  const [result, setResult] = useState<Exploration | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function explore(event: FormEvent) {
    event.preventDefault();
    if (!word.trim() || state === "loading") return;
    setState("loading"); setResult(null);
    try {
      const response = await fetch("/api/explore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ word: word.trim() }) });
      if (!response.ok) throw new Error();
      setResult(await response.json()); setState("idle");
    } catch { setState("error"); }
  }

  return <section className="vocab-explorer">
    <div className="explorer-heading"><div><p className="panel-kicker">AI Vocabulary Explorer</p><h3>词汇联想</h3></div><span>Qwen</span></div>
    <form onSubmit={explore}><label htmlFor="explore-word">输入一个法语词汇</label><div><input id="explore-word" value={word} onChange={(event) => setWord(event.target.value)} placeholder="例如：fringant" autoComplete="off" /><button disabled={state === "loading"}>{state === "loading" ? "分析中…" : "生成相关词"}</button></div></form>
    {state === "error" && <p className="explorer-error">生成失败，请稍后重试。</p>}
    {result && <div className="explorer-result">
      <div className="word-summary"><h4>{result.word}</h4><span>{result.wordType}</span><p>{result.meaning}</p></div>
      <h5>相关词</h5>
      <div className="table-wrap"><table><thead><tr><th>法语</th><th>关系</th><th>词性</th><th>中文</th></tr></thead><tbody>{result.relatedWords.map((item) => <tr key={`${item.word}-${item.relationship}`}><td>{item.word}</td><td>{item.relationship}</td><td>{item.wordType}</td><td>{item.meaning}</td></tr>)}</tbody></table></div>
      <h5>近义词与区别</h5>
      <div className="table-wrap"><table><thead><tr><th>法语</th><th>词性</th><th>中文</th><th>细微区别</th></tr></thead><tbody>{result.synonyms.map((item) => <tr key={item.word}><td>{item.word}</td><td>{item.wordType}</td><td>{item.meaning}</td><td>{item.difference}</td></tr>)}</tbody></table></div>
    </div>}
  </section>;
}
