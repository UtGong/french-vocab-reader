"use client";

import { useEffect, useRef, useState } from "react";

const formatTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60), remaining = seconds % 60;
  return hours ? [hours, minutes, remaining].map((value) => String(value).padStart(2, "0")).join(":") : [minutes, remaining].map((value) => String(value).padStart(2, "0")).join(":");
};

function signalFinished() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass(), oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.frequency.value = 660; gain.gain.setValueAtTime(.15, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .7);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .7);
  } catch { /* The browser may block audio outside a user gesture. */ }
}

export default function StudyTimer() {
  const [minutes, setMinutes] = useState(25);
  const [remaining, setRemaining] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [stopwatchRunning, setStopwatchRunning] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const timerEnd = useRef(0), stopwatchStart = useRef(0), stopwatchBase = useRef(0);

  useEffect(() => {
    if (!timerRunning) return;
    const tick = () => {
      const next = Math.max(0, Math.ceil((timerEnd.current - Date.now()) / 1000)); setRemaining(next);
      if (!next) { setTimerRunning(false); signalFinished(); }
    };
    tick(); const interval = window.setInterval(tick, 250); return () => window.clearInterval(interval);
  }, [timerRunning]);
  useEffect(() => {
    if (!stopwatchRunning) return;
    const tick = () => setElapsed(stopwatchBase.current + Math.floor((Date.now() - stopwatchStart.current) / 1000));
    tick(); const interval = window.setInterval(tick, 250); return () => window.clearInterval(interval);
  }, [stopwatchRunning]);

  function toggleTimer() {
    if (timerRunning) setTimerRunning(false);
    else if (remaining > 0) { timerEnd.current = Date.now() + remaining * 1000; setTimerRunning(true); }
  }
  function resetTimer() { setTimerRunning(false); setRemaining(minutes * 60); }
  function changeMinutes(value: number) { const safe = Math.min(180, Math.max(1, value || 1)); setMinutes(safe); if (!timerRunning) setRemaining(safe * 60); }
  function toggleStopwatch() {
    if (stopwatchRunning) { stopwatchBase.current = elapsed; setStopwatchRunning(false); }
    else { stopwatchStart.current = Date.now(); stopwatchBase.current = elapsed; setStopwatchRunning(true); }
  }
  function resetStopwatch() { setStopwatchRunning(false); stopwatchBase.current = 0; setElapsed(0); }

  return <section className={`study-timers compact ${expanded ? "expanded" : ""}`}><div className="timer-compact-bar"><div><small>倒计时</small><strong>{formatTime(remaining)}</strong><button onClick={toggleTimer}>{timerRunning ? "暂停" : remaining === 0 ? "完成" : "开始"}</button></div><div><small>秒表</small><strong>{formatTime(elapsed)}</strong><button onClick={toggleStopwatch}>{stopwatchRunning ? "暂停" : elapsed ? "继续" : "开始"}</button></div><button className="timer-expand" aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>{expanded ? "收起设置" : "计时设置"}</button></div>{expanded && <div className="timer-settings"><label>倒计时分钟<input aria-label="倒计时分钟" type="number" min="1" max="180" value={minutes} disabled={timerRunning} onChange={(event) => changeMinutes(Number(event.target.value))} /></label><button onClick={resetTimer}>重置倒计时</button><button onClick={resetStopwatch}>重置秒表</button><span>{timerRunning || stopwatchRunning ? "正在计时" : "准备就绪"}</span></div>}</section>;
}

declare global { interface Window { webkitAudioContext: typeof AudioContext; } }
