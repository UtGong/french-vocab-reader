"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import VocabExplorer from "./components/VocabExplorer";
import StudyQueue, { QueueWord } from "./components/StudyQueue";
import AuthGate from "./components/AuthGate";
import StudyTimer from "./components/StudyTimer";

type LearnedWord = { id: number; word: string; word_type_zh: string; meaning_zh: string; details_zh: string; source_word: string; learned_at: string };
const sample = "Je t’aime.";
const frenchLevels = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const wordTypes = ["名词", "动词", "代词", "形容词", "副词", "介词", "连词", "冠词", "数词", "感叹词", "短语", "其他"];
const splitWords = (value: string): string[] => Array.from(value.match(/[\p{L}\p{M}'’-]+/gu) ?? []);
const defaultStudyWords: QueueWord[] = [
  { id: -1, word: "Je", word_type_zh: "代词", meaning_zh: "我", details_zh: "第一人称单数主语代词", source_word: "默认文本", created_at: "" },
  { id: -2, word: "t’aime", word_type_zh: "动词", meaning_zh: "爱你", details_zh: "te aime 的省音形式，来自动词 aimer", source_word: "默认文本", created_at: "" },
];

function VocabularyApp({ email, logout }: { email: string; logout: () => Promise<void> }) {
  const [text, setText] = useState(sample);
  const [targetLevel, setTargetLevel] = useState("B2");
  const [words, setWords] = useState(splitWords(sample));
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [playback, setPlayback] = useState<"once" | "repeat">("repeat");
  const [status, setStatus] = useState("准备就绪");
  const [wordType, setWordType] = useState("代词");
  const [meaning, setMeaning] = useState("我");
  const [learned, setLearned] = useState<LearnedWord[]>([]);
  const [saveStatus, setSaveStatus] = useState("");
  const [details, setDetails] = useState("第一人称单数主语代词");
  const [queue, setQueue] = useState<QueueWord[]>([]);
  const [studyWords, setStudyWords] = useState<QueueWord[]>(defaultStudyWords);
  const [mode, setMode] = useState<"text" | "explore">("text");
  const [textStatus, setTextStatus] = useState("已预生成词义，可以直接开始学习");
  const [selectedLearned, setSelectedLearned] = useState<number[]>([]);
  const learnedGroups = useMemo(() => {
    const grouped = new Map<string, LearnedWord[]>();
    learned.forEach((item) => { const name = item.source_word || "独立词汇"; grouped.set(name, [...(grouped.get(name) ?? []), item]); });
    return Array.from(grouped.entries());
  }, [learned]);
  const editTimers = useRef<Record<number, number>>({});

  const speechTimer = useRef<number | null>(null);
  const active = useRef(false), position = useRef(0), list = useRef(words);
  const wordTypeNow = useRef(wordType), meaningNow = useRef(meaning), studyItems = useRef(studyWords);
  const playMode = useRef(playback);
  useEffect(() => { active.current = running; }, [running]);
  useEffect(() => { position.current = index; }, [index]);
  useEffect(() => { list.current = words; }, [words]);
  useEffect(() => { wordTypeNow.current = wordType; }, [wordType]);
  useEffect(() => { meaningNow.current = meaning; }, [meaning]);
  useEffect(() => { studyItems.current = studyWords; }, [studyWords]);

  const loadLearned = useCallback(async () => {
    try {
      const response = await fetch("/api/words");
      if (!response.ok) return;
      setLearned(await response.json());
    } catch { /* Database may not be configured during local development. */ }
  }, []);
  useEffect(() => { loadLearned(); }, [loadLearned]);
  const loadQueue = useCallback(async () => {
    try { const response = await fetch("/api/queue"); if (response.ok) { const items = await response.json(); setQueue(items); return items as QueueWord[]; } } catch {}
    return [] as QueueWord[];
  }, []);
  useEffect(() => { loadQueue(); }, [loadQueue]);

  function stop(label = "已暂停") {
    active.current = false; setRunning(false); speechSynthesis.cancel();
    if (speechTimer.current !== null) window.clearTimeout(speechTimer.current);
    speechTimer.current = null; setStatus(label);
  }
  function speak(word: string) {
    if (speechTimer.current !== null) window.clearTimeout(speechTimer.current);
    speechSynthesis.cancel();
    speechSynthesis.resume();
    speechTimer.current = window.setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(word);
      const frenchVoice = speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("fr"));
      if (frenchVoice) utterance.voice = frenchVoice;
      utterance.lang = frenchVoice?.lang || "fr-FR"; utterance.rate = 0.72; utterance.volume = 1;
      utterance.onstart = () => setStatus("正在播放法语发音");
      utterance.onerror = () => setStatus("无法播放发音，请检查浏览器声音设置");
      utterance.onend = () => {
        setStatus("点击“下一个单词”继续");
        if (active.current && playMode.current === "repeat" && list.current[position.current] === word) {
          speechTimer.current = window.setTimeout(() => {
            if (active.current && playMode.current === "repeat" && list.current[position.current] === word) speak(word);
          }, 3000);
        }
      };
      speechSynthesis.speak(utterance);
    }, 80);
  }
  async function completeCurrentWord() {
    const word = list.current[position.current];
    const currentType = wordTypeNow.current, currentMeaning = meaningNow.current;
    if (!word || !currentType || !currentMeaning.trim()) { setSaveStatus("词义尚未生成，请稍候"); return false; }
    setSaveStatus("正在移入已学单词…");
    try {
      const queued = studyItems.current[position.current];
      const response = await fetch("/api/words", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ word, wordType: currentType, meaning: currentMeaning.trim(), details: queued?.details_zh || "", sourceWord: queued?.source_word || "文本学习" }) });
      if (!response.ok) throw new Error();
      if (queued?.id > 0) await fetch(`/api/queue?id=${queued.id}`, { method: "DELETE" });
      await Promise.all([loadLearned(), loadQueue()]);
      setSaveStatus("已加入已学单词"); return true;
    } catch { setSaveStatus("保存失败，请重试"); return false; }
  }
  async function next() {
    speechSynthesis.cancel();
    if (speechTimer.current !== null) window.clearTimeout(speechTimer.current);
    speechTimer.current = null;
    if (!(await completeCurrentWord())) return;
    const nextIndex = position.current + 1;
    if (nextIndex >= list.current.length) { stop("学习完成 — très bien !"); return; }
    position.current = nextIndex; setIndex(nextIndex); speak(list.current[nextIndex]);
  }
  function start() {
    if (!studyWords.length) { setStatus("请先确认文本，或从学习清单选择词汇"); return; }
    const parsed = studyWords.map((item) => item.word);
    if (!parsed.length) { setStatus("请先输入法语文本"); return; }
    const currentIndex = index < parsed.length ? index : 0;
    setWords(parsed); list.current = parsed; setIndex(currentIndex); position.current = currentIndex;
    active.current = true; setRunning(true);
    setStatus("正在准备法语发音");
    speak(parsed[currentIndex]);
  }
  function reset() { stop("准备就绪"); setIndex(0); position.current = 0; setMeaning(studyWords[0]?.meaning_zh ?? ""); setDetails(studyWords[0]?.details_zh ?? ""); setSaveStatus(""); }

  useEffect(() => { speechSynthesis.getVoices(); return () => { speechSynthesis.cancel(); if (speechTimer.current !== null) window.clearTimeout(speechTimer.current); }; }, []);
  const currentWord = words[index] ?? "—";

  useEffect(() => {
    if (!currentWord || currentWord === "—") return;
    const queued = studyWords[index];
    if (queued?.word === currentWord) {
      setWordType(queued.word_type_zh); setMeaning(queued.meaning_zh); setDetails(queued.details_zh); setSaveStatus("点击“下一个单词”后移入已学单词");
      return;
    }
    setWordType(""); setMeaning(""); setDetails(""); setSaveStatus("请先确认文本并生成全部词义");
  }, [currentWord, index, studyWords]);

  function beginStudy(items: QueueWord[]) {
    stop("准备学习"); setStudyWords(items); const selectedWords = items.map((item) => item.word);
    studyItems.current = items;
    setWords(selectedWords); list.current = selectedWords; setIndex(0); position.current = 0;
    setWordType(items[0].word_type_zh); setMeaning(items[0].meaning_zh); setDetails(items[0].details_zh); setSaveStatus("点击“开始”进入学习");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function prepareText() {
    const parsed = splitWords(text);
    if (!parsed.length) { setTextStatus("请输入法语文本"); return; }
    setTextStatus("正在生成全部词性和释义…"); stop("正在准备词汇");
    try {
      const response = await fetch("/api/analyze-text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ words: parsed, targetLevel }) });
      if (!response.ok) throw new Error();
      const generated = await response.json();
      const byWord = new Map<string, QueueWord>(generated.items.map((item: { word: string; wordType: string; meaning: string }, itemIndex: number) => [item.word.toLocaleLowerCase("fr"), { id: -(itemIndex + 1), word: item.word, word_type_zh: item.wordType, meaning_zh: item.meaning, details_zh: "来自已确认文本", source_word: "文本学习", created_at: "" }]));
      const prepared = parsed.map((word) => byWord.get(word.toLocaleLowerCase("fr"))).filter((item: QueueWord | undefined): item is QueueWord => Boolean(item));
      if (prepared.length !== parsed.length) throw new Error();
      beginStudy(prepared); setTextStatus(`已生成 ${prepared.length} 个词汇，可以开始学习`);
    } catch { setTextStatus("智能生成失败，请检查设置后重试"); }
  }

  async function deleteQueueWord(id: number) {
    if (!(await fetch(`/api/queue?id=${id}`, { method: "DELETE" })).ok) { setSaveStatus("删除失败"); return; }
    setQueue((items) => items.filter((item) => item.id !== id)); setSaveStatus("已从学习清单删除");
  }

  async function deleteLearnedWord(id: number) {
    if (!(await fetch(`/api/words?id=${id}`, { method: "DELETE" })).ok) { setSaveStatus("删除失败"); return; }
    setLearned((items) => items.filter((item) => item.id !== id)); setSaveStatus("已删除已学单词");
  }

  async function deleteSelectedLearned() {
    const ids = [...selectedLearned];
    const responses = await Promise.all(ids.map((id) => fetch(`/api/words?id=${id}`, { method: "DELETE" })));
    if (responses.some((response) => !response.ok)) { setSaveStatus("部分单词删除失败"); await loadLearned(); return; }
    setLearned((items) => items.filter((item) => !ids.includes(item.id))); setSelectedLearned([]); setSaveStatus(`已删除 ${ids.length} 个已学单词`);
  }

  async function moveBackToQueue(item: LearnedWord) {
    const response = await fetch("/api/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [{ word: item.word, wordType: item.word_type_zh, meaning: item.meaning_zh, details: item.details_zh || "从已学单词移回", sourceWord: item.source_word || item.word }] }) });
    if (!response.ok) { setSaveStatus("移动失败"); return; }
    await deleteLearnedWord(item.id); await loadQueue(); setSaveStatus("已移回学习清单");
  }

  async function markQueueWordLearned(item: QueueWord) {
    const response = await fetch("/api/words", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ word: item.word, wordType: item.word_type_zh, meaning: item.meaning_zh, details: item.details_zh, sourceWord: item.source_word }) });
    if (!response.ok) { setSaveStatus("移动失败"); return; }
    await deleteQueueWord(item.id); await loadLearned(); setSaveStatus("已移入已学单词");
  }

  function editLearned(id: number, field: "word" | "word_type_zh" | "meaning_zh" | "details_zh" | "source_word", value: string) {
    const current = learned.find((item) => item.id === id);
    if (!current) return;
    const changed = { ...current, [field]: value };
    setLearned((items) => items.map((item) => item.id === id ? changed : item));
    window.clearTimeout(editTimers.current[id]);
    editTimers.current[id] = window.setTimeout(async () => {
      setSaveStatus("保存修改中…");
      try {
        const response = await fetch("/api/words", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, word: changed.word, wordType: changed.word_type_zh, meaning: changed.meaning_zh, details: changed.details_zh, sourceWord: changed.source_word }),
        });
        if (!response.ok) throw new Error();
        setSaveStatus("修改已保存");
      } catch { setSaveStatus("修改保存失败"); }
    }, 700);
  }

  return <main>
    <header><span>☾</span><div><h1>For Taxol</h1><p>The choice of moon</p></div><div className="account-menu"><small>{email}</small><button onClick={logout}>退出登录</button></div></header>
    <section className="card">
      <nav className="primary-switch"><button className={mode === "text" ? "active" : ""} onClick={() => setMode("text")}>法语文本</button><button className={mode === "explore" ? "active" : ""} onClick={() => setMode("explore")}>词汇联想</button></nav>
      <section className="level-selector"><div><label htmlFor="target-level">目标法语等级</label><p>AI 将优先采用适合该等级考试的词汇、搭配和释义。</p></div><select id="target-level" value={targetLevel} onChange={(event) => setTargetLevel(event.target.value)}>{frenchLevels.map((level) => <option key={level} value={level}>{level}</option>)}</select></section>
      {mode === "text" ? <section className="text-preparation"><label htmlFor="text">法语文本</label>
        <textarea id="text" value={text} onChange={(event) => { stop("准备就绪"); setStudyWords([]); setTextStatus(""); setText(event.target.value); setWords(splitWords(event.target.value)); setIndex(0); position.current = 0; }} />
        <div className="confirm-row"><span>{splitWords(text).length} 个词</span><button onClick={prepareText} disabled={textStatus.startsWith("正在")}>确认文本并生成词义</button></div><p className="text-status">{textStatus}</p>
      </section> : <VocabExplorer onQueued={loadQueue} targetLevel={targetLevel} />}
      <div className="options playback-only">
        <fieldset><legend>播放方式</legend><div><button className={playback === "once" ? "selected" : ""} onClick={() => { setPlayback("once"); playMode.current = "once"; }}><b>播放一次</b><small>仅播放一遍</small></button><button className={playback === "repeat" ? "selected" : ""} onClick={() => { setPlayback("repeat"); playMode.current = "repeat"; }}><b>重复播放</b><small>每 3 秒一次</small></button></div></fieldset>
      </div>
      <StudyTimer />
      <section className="player">
        <div className="meta"><span>单词 {Math.min(index + 1, words.length || 1)} / {words.length}</span><span>{status}</span></div>
        <div className="study-sides"><div className="french-side"><small>Français</small><h2>{currentWord}</h2></div><div className="chinese-side"><small>中文解释</small><b>{wordType || "—"}</b><p>{meaning || "正在生成…"}</p>{details && <em>{details}</em>}</div></div><div className="bar"><i style={{ width: `${words.length ? (index + 1) / words.length * 100 : 0}%` }} /></div>
        <div className="actions">{running ? <button className="start" onClick={() => stop()}>暂停</button> : <button className="start" onClick={start}>开始</button>}<button className="next" onClick={next}>下一个单词 →</button><button className="reset" onClick={reset}>重置</button></div>
      </section>
      <StudyQueue items={queue} onStart={beginStudy} onDelete={deleteQueueWord} onLearned={markQueueWordLearned} />
      <section className="learned-list">
        <div className="list-title"><h3>已学单词</h3><span>{learned.length}</span>{learned.length > 0 && <div className="list-bulk-actions"><button onClick={() => setSelectedLearned(selectedLearned.length === learned.length ? [] : learned.map((item) => item.id))}>{selectedLearned.length === learned.length ? "取消全选" : "全选"}</button><button className="danger-link" disabled={!selectedLearned.length} onClick={deleteSelectedLearned}>删除已选（{selectedLearned.length}）</button></div>}</div>
        {learned.length === 0 ? <p className="empty">学过的单词会自动显示在这里。</p> : <div className="table-wrap vocabulary-storage"><table className="learned-table"><thead><tr><th>选择</th><th>法语</th><th>词性</th><th>中文释义</th><th>关系 / 用法</th><th>学习日期</th><th>操作</th></tr></thead><tbody>{learnedGroups.map(([group, groupItems]) => <Fragment key={group}><tr className="vocab-group"><th colSpan={7}><span>词汇组</span><b>{group}</b><em>{groupItems.length} 个词</em></th></tr>{groupItems.map((item) => <tr key={item.id}><td><input aria-label={`选择 ${item.word}`} type="checkbox" checked={selectedLearned.includes(item.id)} onChange={() => setSelectedLearned((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])} /></td><td><input aria-label="法语" value={item.word} onChange={(event) => editLearned(item.id, "word", event.target.value)} /></td><td><select aria-label="词性" value={item.word_type_zh} onChange={(event) => editLearned(item.id, "word_type_zh", event.target.value)}>{wordTypes.map((type) => <option key={type}>{type}</option>)}</select></td><td><input aria-label="中文释义" value={item.meaning_zh} onChange={(event) => editLearned(item.id, "meaning_zh", event.target.value)} /></td><td><input aria-label="关系或用法" value={item.details_zh} placeholder="补充关系或用法" onChange={(event) => editLearned(item.id, "details_zh", event.target.value)} /></td><td className="date-cell">{new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(item.learned_at))}</td><td><div className="row-actions"><button onClick={() => moveBackToQueue(item)}>移回学习清单</button><button className="danger-link" onClick={() => deleteLearnedWord(item.id)}>删除</button></div></td></tr>)}</Fragment>)}</tbody></table></div>}
      </section>
    </section>
    <footer>Utilise la voix française de votre navigateur.</footer>
  </main>;
}

export default function Home() {
  return <AuthGate>{(user, logout) => <VocabularyApp email={user.email} logout={logout} />}</AuthGate>;
}
