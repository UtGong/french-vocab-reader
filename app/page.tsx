"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import VocabExplorer from "./components/VocabExplorer";
import StudyQueue, { QueueWord } from "./components/StudyQueue";
import AuthGate from "./components/AuthGate";
import StudyTimer from "./components/StudyTimer";
import SentencePractice from "./components/SentencePractice";
import Dictionary from "./components/Dictionary";
import MilestoneCelebration from "./components/MilestoneCelebration";

type LearnedWord = { id: number; word: string; phonetic: string; word_type_zh: string; meaning_zh: string; details_zh: string; source_word: string; learned_at: string };
const sample = "Je t’aime.";
const frenchLevels = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const wordTypes = ["名词", "动词", "代词", "形容词", "副词", "介词", "连词", "冠词", "数词", "感叹词", "短语", "其他"];
const splitWords = (value: string): string[] => Array.from(value.match(/[\p{L}\p{M}'’-]+/gu) ?? []);
const defaultStudyWords: QueueWord[] = [
  { id: -1, word: "Je", phonetic: "/ʒə/", word_type_zh: "代词", meaning_zh: "我", details_zh: "第一人称单数主语代词", source_word: "默认文本", created_at: "" },
  { id: -2, word: "t’aime", phonetic: "/tɛm/", word_type_zh: "动词", meaning_zh: "爱你", details_zh: "te aime 的省音形式，来自动词 aimer", source_word: "默认文本", created_at: "" },
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
  const [mode, setMode] = useState<"text" | "explore" | "dictionary" | "sentence">("text");
  const [textStatus, setTextStatus] = useState("已预生成词义，可以直接开始学习");
  const [selectedLearned, setSelectedLearned] = useState<number[]>([]);
  const [groupLearnedBy, setGroupLearnedBy] = useState<"source" | "date">("source");
  const [textPreview, setTextPreview] = useState<QueueWord[]>([]);
  const [selectedPreview, setSelectedPreview] = useState<number[]>([]);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [collapsedLearnedGroups, setCollapsedLearnedGroups] = useState<string[]>([]);
  const [celebration, setCelebration] = useState<number | null>(null);
  const learnedGroups = useMemo(() => {
    const grouped = new Map<string, LearnedWord[]>();
    learned.forEach((item) => { const name = groupLearnedBy === "date" ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date(item.learned_at)) : item.source_word || "独立词汇"; grouped.set(name, [...(grouped.get(name) ?? []), item]); });
    return Array.from(grouped.entries());
  }, [learned, groupLearnedBy]);
  const editTimers = useRef<Record<number, number>>({});

  const speechTimer = useRef<number | null>(null);
  const playerRef = useRef<HTMLElement | null>(null);
  const frenchVoices = useRef<SpeechSynthesisVoice[]>([]);
  const studyMode = useRef<"learn" | "review">("learn");
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
  useEffect(() => {
    const milestone = Math.floor(learned.length / 25) * 25 || null;
    if (!milestone) return;
    const storageKey = `french-vocab-milestones:${email}`;
    let celebrated: number[] = [];
    try { celebrated = JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch { localStorage.removeItem(storageKey); }
    if (celebrated.includes(milestone)) return;
    localStorage.setItem(storageKey, JSON.stringify([...celebrated, milestone])); setCelebration(milestone);
  }, [learned.length, email]);
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
      const available = speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith("fr"));
      if (available.length) frenchVoices.current = available;
      const frenchVoice = [...frenchVoices.current].sort((a, b) => Number(b.lang.toLowerCase() === "fr-fr") - Number(a.lang.toLowerCase() === "fr-fr") || Number(/thomas|audrey|amelie|hortense|virginie/i.test(b.name)) - Number(/thomas|audrey|amelie|hortense|virginie/i.test(a.name)))[0];
      if (!frenchVoice) { setStatus("未找到法语语音，请在系统中安装 French / Français 语音"); return; }
      utterance.voice = frenchVoice;
      utterance.lang = frenchVoice.lang; utterance.rate = 0.72; utterance.volume = 1;
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
    if (studyMode.current === "review") { setSaveStatus("复习进度不会改变首次学习日期"); return true; }
    const word = list.current[position.current];
    const currentType = wordTypeNow.current, currentMeaning = meaningNow.current;
    if (!word || !currentType || !currentMeaning.trim()) { setSaveStatus("词义尚未生成，请稍候"); return false; }
    setSaveStatus("正在移入已学单词…");
    try {
      const queued = studyItems.current[position.current];
      const response = await fetch("/api/words", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ word, phonetic: queued?.phonetic || "", wordType: currentType, meaning: currentMeaning.trim(), details: queued?.details_zh || "", sourceWord: queued?.source_word || "文本学习" }) });
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
  function previous() {
    if (position.current <= 0) return;
    const wasRunning = active.current;
    speechSynthesis.cancel();
    if (speechTimer.current !== null) window.clearTimeout(speechTimer.current);
    speechTimer.current = null;
    const previousIndex = position.current - 1;
    position.current = previousIndex; setIndex(previousIndex);
    if (wasRunning) speak(list.current[previousIndex]); else setStatus("已返回上一个单词");
  }
  function start() {
    if (!studyWords.length) { setStatus("请先确认文本，或从待学习选择词汇"); return; }
    const parsed = studyWords.map((item) => item.word);
    if (!parsed.length) { setStatus("请先输入法语文本"); return; }
    const currentIndex = index < parsed.length ? index : 0;
    setWords(parsed); list.current = parsed; setIndex(currentIndex); position.current = currentIndex;
    active.current = true; setRunning(true);
    setStatus("正在准备法语发音");
    speak(parsed[currentIndex]);
  }
  function reset() { stop("准备就绪"); setIndex(0); position.current = 0; setMeaning(studyWords[0]?.meaning_zh ?? ""); setDetails(studyWords[0]?.details_zh ?? ""); setSaveStatus(""); }

  useEffect(() => { const loadVoices = () => { frenchVoices.current = speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith("fr")); }; loadVoices(); speechSynthesis.addEventListener("voiceschanged", loadVoices); return () => { speechSynthesis.removeEventListener("voiceschanged", loadVoices); speechSynthesis.cancel(); if (speechTimer.current !== null) window.clearTimeout(speechTimer.current); }; }, []);
  const currentWord = words[index] ?? "—";

  useEffect(() => {
    if (!currentWord || currentWord === "—") return;
    const queued = studyWords[index];
    if (queued?.word === currentWord) {
      setWordType(queued.word_type_zh); setMeaning(queued.meaning_zh); setDetails(queued.details_zh); setSaveStatus(studyMode.current === "review" ? "复习模式：不会改变首次学习日期" : "点击“下一个单词”后移入已学单词");
      return;
    }
    setWordType(""); setMeaning(""); setDetails(""); setSaveStatus("请先确认文本并生成全部词义");
  }, [currentWord, index, studyWords]);

  function beginStudy(items: QueueWord[], mode: "learn" | "review" = "learn") {
    if (!items.length) return;
    studyMode.current = mode;
    stop("准备学习"); setStudyWords(items); const selectedWords = items.map((item) => item.word);
    studyItems.current = items;
    setWords(selectedWords); list.current = selectedWords; setIndex(0); position.current = 0;
    setWordType(items[0].word_type_zh); setMeaning(items[0].meaning_zh); setDetails(items[0].details_zh); setSaveStatus(mode === "review" ? "复习模式：不会改变首次学习日期" : "点击“开始”进入学习");
    window.setTimeout(() => playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function prepareText() {
    const parsed = splitWords(text);
    if (!parsed.length) { setTextStatus("请输入法语文本"); return; }
    const uniqueWords = Array.from(new Map(parsed.map((word) => [word.toLocaleLowerCase("fr"), word])).values());
    const batches = Array.from({ length: Math.ceil(uniqueWords.length / 18) }, (_, index) => uniqueWords.slice(index * 18, index * 18 + 18));
    setTextStatus(`正在分析 ${uniqueWords.length} 个不同词汇…`); stop("正在准备词汇");
    try {
      const analyzeBatch = async (batch: string[], attempt = 0): Promise<Array<{ word: string; phonetic: string; wordType: string; meaning: string }>> => {
        const response = await fetch("/api/analyze-text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ words: batch, targetLevel }) });
        if (!response.ok) { if (attempt < 1) return analyzeBatch(batch, attempt + 1); throw new Error(); }
        const generated = await response.json();
        if (!Array.isArray(generated.items) || generated.items.length !== batch.length) { if (attempt < 1) return analyzeBatch(batch, attempt + 1); throw new Error(); }
        return generated.items;
      };
      const analyzed: Array<{ word: string; phonetic: string; wordType: string; meaning: string }> = [];
      for (let index = 0; index < batches.length; index += 2) {
        setTextStatus(`正在生成词义：第 ${index + 1}–${Math.min(index + 2, batches.length)} / ${batches.length} 批…`);
        const results = await Promise.all(batches.slice(index, index + 2).map((batch) => analyzeBatch(batch)));
        analyzed.push(...results.flat());
      }
      const byWord = new Map<string, QueueWord>(analyzed.map((item, itemIndex) => [item.word.toLocaleLowerCase("fr"), { id: -(itemIndex + 1), word: item.word, phonetic: item.phonetic, word_type_zh: item.wordType, meaning_zh: item.meaning, details_zh: "来自已确认文本", source_word: "文本学习", created_at: "" }]));
      const prepared = parsed.map((word, occurrenceIndex) => { const item = byWord.get(word.toLocaleLowerCase("fr")); return item ? { ...item, id: -(occurrenceIndex + 1), word } : undefined; }).filter((item: QueueWord | undefined): item is QueueWord => Boolean(item));
      if (prepared.length !== parsed.length) throw new Error();
      setTextPreview(prepared); setSelectedPreview(prepared.map((item) => item.id)); setTextStatus(`已生成 ${prepared.length} 个词汇，请确认后开始学习`);
    } catch { setTextStatus("部分词汇生成失败，请重试；系统会自动分批处理长文本"); }
  }

  async function saveSelectedPreview(destination: "queue" | "learned") {
    const chosen = textPreview.filter((item) => selectedPreview.includes(item.id));
    if (!chosen.length) return;
    setTextStatus(destination === "queue" ? "正在加入待学习…" : "正在标为已学…");
    const payloads = chosen.map((item) => ({ word: item.word, phonetic: item.phonetic, wordType: item.word_type_zh, meaning: item.meaning_zh, details: item.details_zh, sourceWord: "文本学习" }));
    try {
      const responses = destination === "queue"
        ? [await fetch("/api/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: payloads }) })]
        : await Promise.all(payloads.map((item) => fetch("/api/words", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) })));
      if (responses.some((response) => !response.ok)) throw new Error();
      await Promise.all([loadQueue(), loadLearned()]);
      setTextStatus(destination === "queue" ? "已将所选词汇加入待学习" : "已将所选词汇标为已学");
    } catch { setTextStatus("保存所选词汇失败，请重试"); }
  }

  function deleteSelectedPreview() {
    if (!selectedPreview.length) return;
    const removed = selectedPreview.length;
    setTextPreview((items) => items.filter((item) => !selectedPreview.includes(item.id)));
    setSelectedPreview([]);
    setTextStatus(`已从生成结果移除 ${removed} 个词汇`);
  }

  async function deleteQueueWord(id: number) {
    if (!(await fetch(`/api/queue?id=${id}`, { method: "DELETE" })).ok) { setSaveStatus("删除失败"); return; }
    setQueue((items) => items.filter((item) => item.id !== id)); setSaveStatus("已从待学习删除");
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
    const response = await fetch("/api/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [{ word: item.word, phonetic: item.phonetic, wordType: item.word_type_zh, meaning: item.meaning_zh, details: item.details_zh || "从已学单词移回", sourceWord: item.source_word || item.word }] }) });
    if (!response.ok) { setSaveStatus("移动失败"); return; }
    await deleteLearnedWord(item.id); await loadQueue(); setSaveStatus("已移回待学习");
  }

  async function markQueueWordLearned(item: QueueWord) {
    const response = await fetch("/api/words", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ word: item.word, phonetic: item.phonetic, wordType: item.word_type_zh, meaning: item.meaning_zh, details: item.details_zh, sourceWord: item.source_word }) });
    if (!response.ok) { setSaveStatus("移动失败"); return; }
    await deleteQueueWord(item.id); await loadLearned(); setSaveStatus("已移入已学单词");
  }

  function editLearned(id: number, field: "word" | "phonetic" | "word_type_zh" | "meaning_zh" | "details_zh" | "source_word", value: string) {
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
          body: JSON.stringify({ id, word: changed.word, phonetic: changed.phonetic, wordType: changed.word_type_zh, meaning: changed.meaning_zh, details: changed.details_zh, sourceWord: changed.source_word }),
        });
        if (!response.ok) throw new Error();
        setSaveStatus("修改已保存");
      } catch { setSaveStatus("修改保存失败"); }
    }, 700);
  }

  function reviewSelectedLearned() {
    const selected = learned.filter((item) => selectedLearned.includes(item.id)).map<QueueWord>((item) => ({ id: -item.id, word: item.word, phonetic: item.phonetic, word_type_zh: item.word_type_zh, meaning_zh: item.meaning_zh, details_zh: item.details_zh, source_word: item.source_word, created_at: item.learned_at }));
    beginStudy(selected, "review");
  }

  function toggleLearnedGroup(group: string) { setCollapsedLearnedGroups((groups) => groups.includes(group) ? groups.filter((item) => item !== group) : [...groups, group]); }
  function toggleLearnedGroupSelection(groupItems: LearnedWord[]) {
    const ids = groupItems.map((item) => item.id);
    setSelectedLearned((selected) => ids.every((id) => selected.includes(id)) ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])]);
  }

  const currentPhonetic = studyWords[index]?.phonetic || "音标待补充";

  return <main>
    <MilestoneCelebration milestone={celebration} onClose={() => setCelebration(null)} />
    <header><span>☾</span><div><h1>For Taxol</h1><p>The choice of moon</p></div><div className="account-menu"><small>{email}</small><button onClick={logout}>退出登录</button></div></header>
    <section className="card">
      <nav className="primary-switch four-tabs"><button className={mode === "text" ? "active" : ""} onClick={() => setMode("text")}>法语文本</button><button className={mode === "explore" ? "active" : ""} onClick={() => setMode("explore")}>词汇联想</button><button className={mode === "dictionary" ? "active" : ""} onClick={() => setMode("dictionary")}>法语词典</button><button className={mode === "sentence" ? "active" : ""} onClick={() => setMode("sentence")}>随机造句</button></nav>
      <details className="settings-panel"><summary><b>设置</b><span>等级与播放</span></summary><div className="settings-content">
        <section className="level-selector"><div><label htmlFor="target-level">目标法语等级</label><p>AI 将优先采用适合该等级考试的词汇、搭配和释义。</p></div><select id="target-level" value={targetLevel} onChange={(event) => setTargetLevel(event.target.value)}>{frenchLevels.map((level) => <option key={level} value={level}>{level}</option>)}</select></section>
        <div className="options playback-only"><fieldset><legend>播放方式</legend><div><button className={playback === "once" ? "selected" : ""} onClick={() => { setPlayback("once"); playMode.current = "once"; }}><b>播放一次</b><small>仅播放一遍</small></button><button className={playback === "repeat" ? "selected" : ""} onClick={() => { setPlayback("repeat"); playMode.current = "repeat"; }}><b>重复播放</b><small>每 3 秒一次</small></button></div></fieldset></div>
      </div></details>
      {mode === "text" ? <section className="text-preparation"><label htmlFor="text">法语文本</label>
        <textarea id="text" value={text} onChange={(event) => { stop("准备就绪"); setStudyWords([]); setTextPreview([]); setTextStatus(""); setText(event.target.value); setWords(splitWords(event.target.value)); setIndex(0); position.current = 0; }} />
        <div className="confirm-row"><span>{splitWords(text).length} 个词</span><button onClick={prepareText} disabled={textStatus.startsWith("正在")}>确认文本并生成词义</button></div><p className="text-status">{textStatus}</p>
        {textPreview.length > 0 && <div className="text-preview"><div className="preview-actions"><b>生成结果</b><button onClick={() => setPreviewOpen((open) => !open)}>{previewOpen ? "收起" : "展开"}</button><button onClick={() => setSelectedPreview(selectedPreview.length === textPreview.length ? [] : textPreview.map((item) => item.id))}>{selectedPreview.length === textPreview.length ? "取消全选" : "全选"}</button><button className="preview-delete" disabled={!selectedPreview.length} onClick={deleteSelectedPreview}>删除已选（{selectedPreview.length}）</button><button disabled={!selectedPreview.length} onClick={() => saveSelectedPreview("queue")}>加入待学习（{selectedPreview.length}）</button><button disabled={!selectedPreview.length} onClick={() => saveSelectedPreview("learned")}>标为已学（{selectedPreview.length}）</button><button className="preview-start" disabled={!selectedPreview.length} onClick={() => beginStudy(textPreview.filter((item) => selectedPreview.includes(item.id)))}>学习已选词汇（{selectedPreview.length}）</button></div>{previewOpen && <div className="table-wrap"><table><thead><tr><th>选择</th><th>法语</th><th>音标</th><th>词性</th><th>中文释义</th></tr></thead><tbody>{textPreview.map((item) => <tr key={item.id}><td><input type="checkbox" aria-label={`选择 ${item.word}`} checked={selectedPreview.includes(item.id)} onChange={() => setSelectedPreview((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])} /></td><td>{item.word}</td><td>{item.phonetic || "—"}</td><td>{item.word_type_zh}</td><td>{item.meaning_zh}</td></tr>)}</tbody></table></div>}</div>}
      </section> : mode === "explore" ? <VocabExplorer onQueued={loadQueue} targetLevel={targetLevel} /> : mode === "dictionary" ? <Dictionary onUpdated={() => { loadQueue(); loadLearned(); }} /> : <SentencePractice targetLevel={targetLevel} />}
      <StudyTimer />
      <section className="player" ref={playerRef}>
        <div className="meta"><span>单词 {Math.min(index + 1, words.length || 1)} / {words.length}</span><span>{status}</span></div>
        <div className="study-sides"><div className="french-side"><small>{currentPhonetic}</small><h2>{currentWord}</h2></div><div className="chinese-side"><small>中文解释</small><b>{wordType || "—"}</b><p>{meaning || "正在生成…"}</p>{details && <em>{details}</em>}</div></div><div className="bar"><i style={{ width: `${words.length ? (index + 1) / words.length * 100 : 0}%` }} /></div>
        <div className="actions">{running ? <button className="start" onClick={() => stop()}>暂停</button> : <button className="start" onClick={start}>开始</button>}<button className="previous" onClick={previous} disabled={index <= 0}>← 上一个单词</button><button className="next" onClick={next}>下一个单词 →</button><button className="reset" onClick={reset}>重置</button></div>
      </section>
      <StudyQueue items={queue} onStart={beginStudy} onDelete={deleteQueueWord} onLearned={markQueueWordLearned} />
      <section className="learned-list">
        <div className="list-title"><h3>已学单词</h3><span>{learned.length}</span><div className="group-method"><button className={groupLearnedBy === "source" ? "active" : ""} onClick={() => setGroupLearnedBy("source")}>按词汇组</button><button className={groupLearnedBy === "date" ? "active" : ""} onClick={() => setGroupLearnedBy("date")}>按首次学习日期</button></div>{learned.length > 0 && <div className="list-bulk-actions"><button onClick={() => setSelectedLearned(selectedLearned.length === learned.length ? [] : learned.map((item) => item.id))}>{selectedLearned.length === learned.length ? "取消全选" : "全选"}</button><button className="review-selected" disabled={!selectedLearned.length} onClick={reviewSelectedLearned}>复习已选（{selectedLearned.length}）</button><button className="danger-link" disabled={!selectedLearned.length} onClick={deleteSelectedLearned}>删除已选（{selectedLearned.length}）</button></div>}</div>
        {learned.length === 0 ? <p className="empty">学过的单词会自动显示在这里。</p> : <div className="table-wrap vocabulary-storage"><table className="learned-table"><thead><tr><th>选择</th><th>法语</th><th>音标</th><th>词性</th><th>中文释义</th><th>关系 / 用法</th><th>首次学习日期</th><th>操作</th></tr></thead><tbody>{learnedGroups.map(([group, groupItems]) => <Fragment key={group}><tr className="vocab-group"><th colSpan={8}><div><span>{groupLearnedBy === "date" ? "学习日期" : "词汇组"}</span><b>{group}</b><em>{groupItems.length} 个词</em><button onClick={() => toggleLearnedGroupSelection(groupItems)}>{groupItems.every((item) => selectedLearned.includes(item.id)) ? "取消本组" : "全选本组"}</button><button onClick={() => toggleLearnedGroup(group)}>{collapsedLearnedGroups.includes(group) ? "展开 +" : "收起 −"}</button></div></th></tr>{!collapsedLearnedGroups.includes(group) && groupItems.map((item) => <tr key={item.id}><td><input aria-label={`选择 ${item.word}`} type="checkbox" checked={selectedLearned.includes(item.id)} onChange={() => setSelectedLearned((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])} /></td><td><input aria-label="法语" value={item.word} onChange={(event) => editLearned(item.id, "word", event.target.value)} /></td><td><input aria-label="音标" value={item.phonetic || ""} placeholder="/fɔ.ne.tik/" onChange={(event) => editLearned(item.id, "phonetic", event.target.value)} /></td><td><select aria-label="词性" value={item.word_type_zh} onChange={(event) => editLearned(item.id, "word_type_zh", event.target.value)}>{wordTypes.map((type) => <option key={type}>{type}</option>)}</select></td><td><input aria-label="中文释义" value={item.meaning_zh} onChange={(event) => editLearned(item.id, "meaning_zh", event.target.value)} /></td><td><input aria-label="关系或用法" value={item.details_zh} placeholder="补充关系或用法" onChange={(event) => editLearned(item.id, "details_zh", event.target.value)} /></td><td className="date-cell">{new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(item.learned_at))}</td><td><div className="row-actions"><button onClick={() => moveBackToQueue(item)}>移回待学习</button><button className="danger-link" onClick={() => deleteLearnedWord(item.id)}>删除</button></div></td></tr>)}</Fragment>)}</tbody></table></div>}
      </section>
    </section>
    <footer>Utilise la voix française de votre navigateur.</footer>
  </main>;
}

export default function Home() {
  return <AuthGate>{(user, logout) => <VocabularyApp email={user.email} logout={logout} />}</AuthGate>;
}
