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

  return <section className="study-timers"><div className="timer-heading"><div><p className="panel-kicker">专注学习</p><h3>学习计时</h3></div><span>{timerRunning || stopwatchRunning ? "计时中" : "准备就绪"}</span></div><div className="timer-grid"><article><div className="timer-label"><b>倒计时</b><label>分钟<input aria-label="倒计时分钟" type="number" min="1" max="180" value={minutes} disabled={timerRunning} onChange={(event) => changeMinutes(Number(event.target.value))} /></label></div><strong>{formatTime(remaining)}</strong><div><button onClick={toggleTimer}>{timerRunning ? "暂停" : remaining === 0 ? "已完成" : "开始"}</button><button onClick={resetTimer}>重置</button></div></article><article><div className="timer-label"><b>秒表</b><small>正向计时</small></div><strong>{formatTime(elapsed)}</strong><div><button onClick={toggleStopwatch}>{stopwatchRunning ? "暂停" : elapsed ? "继续" : "开始"}</button><button onClick={resetStopwatch}>重置</button></div></article></div></section>;
}

declare global { interface Window { webkitAudioContext: typeof AudioContext; } }
