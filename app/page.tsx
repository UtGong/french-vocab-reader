"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Recognition = {
  continuous: boolean; interimResults: boolean; lang: string;
  start(): void; stop(): void;
  onresult: ((event: any) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
};
declare global { interface Window { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition } }

type LearnedWord = { id: number; word: string; word_type_zh: string; meaning_zh: string; learned_at: string };
const sample = "Bonjour, bienvenue en France. Aujourd’hui, nous allons apprendre quelques mots ensemble.";
const wordTypes = ["名词", "动词", "代词", "形容词", "副词", "介词", "连词", "冠词", "数词", "其他"];
const splitWords = (value: string) => value.match(/[\p{L}\p{M}'’-]+/gu) ?? [];

export default function Home() {
  const [text, setText] = useState(sample);
  const [words, setWords] = useState(splitWords(sample));
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [playback, setPlayback] = useState<"once" | "repeat">("repeat");
  const [advance, setAdvance] = useState<"voice" | "button">("voice");
  const [status, setStatus] = useState("Ready");
  const [wordType, setWordType] = useState("名词");
  const [meaning, setMeaning] = useState("");
  const [learned, setLearned] = useState<LearnedWord[]>([]);
  const [saveStatus, setSaveStatus] = useState("");

  const mic = useRef<Recognition | null>(null);
  const active = useRef(false), position = useRef(0), list = useRef(words);
  const playMode = useRef(playback), advanceMode = useRef(advance), lastAdvance = useRef(0);
  useEffect(() => { active.current = running; }, [running]);
  useEffect(() => { position.current = index; }, [index]);
  useEffect(() => { list.current = words; }, [words]);

  const loadLearned = useCallback(async () => {
    try {
      const response = await fetch("/api/words");
      if (!response.ok) return;
      setLearned(await response.json());
    } catch { /* Database may not be configured during local development. */ }
  }, []);
  useEffect(() => { loadLearned(); }, [loadLearned]);

  function stop(label = "Paused") {
    active.current = false; setRunning(false); speechSynthesis.cancel();
    mic.current?.stop(); mic.current = null; setStatus(label);
  }
  function speak(word: string) {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "fr-FR"; utterance.rate = 0.72;
    utterance.onend = () => {
      if (active.current && playMode.current === "repeat" && list.current[position.current] === word) {
        window.setTimeout(() => speak(word), 3000);
      }
    };
    speechSynthesis.speak(utterance);
  }
  function next() {
    const nextIndex = position.current + 1;
    setMeaning(""); setSaveStatus("");
    if (nextIndex >= list.current.length) { stop("Complete — très bien!"); return; }
    position.current = nextIndex; setIndex(nextIndex); speak(list.current[nextIndex]);
  }
  function listen() {
    const RecognitionApi = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!RecognitionApi) { setStatus("Voice unavailable — choose Button"); return; }
    const recognition = new RecognitionApi();
    recognition.continuous = true; recognition.interimResults = true; recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let phrase = "";
      for (let i = 0; i < event.results.length; i += 1) phrase += ` ${event.results[i][0].transcript}`;
      const now = Date.now();
      if (/\b(ok|okay)\b/i.test(phrase) && now - lastAdvance.current > 1200) { lastAdvance.current = now; next(); }
    };
    recognition.onend = () => { if (active.current && advanceMode.current === "voice") try { recognition.start(); } catch {} };
    recognition.onerror = () => setStatus("Microphone blocked — choose Button");
    mic.current = recognition; try { recognition.start(); } catch {}
  }
  function start() {
    const parsed = splitWords(text);
    if (!parsed.length) { setStatus("Enter French text first"); return; }
    const currentIndex = index < parsed.length ? index : 0;
    setWords(parsed); list.current = parsed; setIndex(currentIndex); position.current = currentIndex;
    active.current = true; setRunning(true);
    setStatus(advance === "voice" ? "Listening for “OK”" : "Press Next word");
    speak(parsed[currentIndex]); if (advance === "voice") listen();
  }
  function chooseAdvance(value: "voice" | "button") {
    setAdvance(value); advanceMode.current = value;
    if (running) {
      mic.current?.stop(); mic.current = null;
      setStatus(value === "voice" ? "Listening for “OK”" : "Press Next word");
      if (value === "voice") window.setTimeout(listen, 100);
    }
  }
  function reset() { stop("Ready"); setIndex(0); position.current = 0; setMeaning(""); setSaveStatus(""); }

  async function saveWord() {
    const word = words[index];
    if (!word || !meaning.trim()) { setSaveStatus("请输入中文释义"); return; }
    setSaveStatus("保存中…");
    try {
      const response = await fetch("/api/words", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, wordType, meaning: meaning.trim() }),
      });
      if (!response.ok) throw new Error();
      setSaveStatus("已保存"); await loadLearned();
    } catch { setSaveStatus("数据库尚未连接"); }
  }

  useEffect(() => () => { speechSynthesis.cancel(); mic.current?.stop(); }, []);
  const currentWord = words[index] ?? "—";

  return <main>
    <header><span>☾</span><div><h1>For Taxol</h1><p>The choice of moon</p></div></header>
    <section className="card">
      <label htmlFor="text">French text</label>
      <textarea id="text" value={text} onChange={(event) => { stop("Ready"); setText(event.target.value); setWords(splitWords(event.target.value)); setIndex(0); position.current = 0; }} />
      <p className="count">{splitWords(text).length} words</p>
      <div className="options">
        <fieldset><legend>Move to next word</legend><div><button className={advance === "voice" ? "selected" : ""} onClick={() => chooseAdvance("voice")}><b>Voice</b><small>Say “OK”</small></button><button className={advance === "button" ? "selected" : ""} onClick={() => chooseAdvance("button")}><b>Button</b><small>Press Next</small></button></div></fieldset>
        <fieldset><legend>Playback</legend><div><button className={playback === "once" ? "selected" : ""} onClick={() => { setPlayback("once"); playMode.current = "once"; }}><b>Once</b><small>Play one time</small></button><button className={playback === "repeat" ? "selected" : ""} onClick={() => { setPlayback("repeat"); playMode.current = "repeat"; }}><b>Repeat</b><small>Every 3 sec</small></button></div></fieldset>
      </div>
      <section className="player">
        <div className="meta"><span>Word {Math.min(index + 1, words.length || 1)} / {words.length}</span><span>{status}</span></div>
        <h2>{currentWord}</h2><div className="bar"><i style={{ width: `${words.length ? (index + 1) / words.length * 100 : 0}%` }} /></div>
        <div className="actions">{running ? <button className="start" onClick={() => stop()}>Pause</button> : <button className="start" onClick={start}>Start</button>}<button className="next" onClick={next}>Next word →</button><button className="reset" onClick={reset}>Reset</button></div>
      </section>
      <section className="save-panel">
        <div><p className="panel-kicker">Save learned word</p><h3>{currentWord}</h3></div>
        <label>词性<select value={wordType} onChange={(event) => setWordType(event.target.value)}>{wordTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label>中文释义<input value={meaning} onChange={(event) => setMeaning(event.target.value)} placeholder="例如：你好" /></label>
        <button onClick={saveWord}>保存单词</button><span className="save-status">{saveStatus}</span>
      </section>
      <section className="learned-list">
        <div className="list-title"><h3>已学单词</h3><span>{learned.length}</span></div>
        {learned.length === 0 ? <p className="empty">保存的单词会显示在这里。</p> : <div className="table-wrap"><table><thead><tr><th>法语</th><th>词性</th><th>中文释义</th></tr></thead><tbody>{learned.map((item) => <tr key={item.id}><td>{item.word}</td><td><span>{item.word_type_zh}</span></td><td>{item.meaning_zh}</td></tr>)}</tbody></table></div>}
      </section>
    </section>
    <footer>Uses your browser’s French voice.</footer>
  </main>;
}
