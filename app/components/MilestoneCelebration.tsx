"use client";

import { useEffect } from "react";

export default function MilestoneCelebration({ milestone, onClose }: { milestone: number | null; onClose: () => void }) {
  useEffect(() => { if (!milestone) return; const timer = window.setTimeout(onClose, 6000); return () => window.clearTimeout(timer); }, [milestone, onClose]);
  if (!milestone) return null;
  const grand = milestone % 100 === 0, pieces = grand ? 56 : 28;
  return <div className={`milestone-celebration ${grand ? "grand" : ""}`} role="dialog" aria-modal="true" aria-label={`已学会 ${milestone} 个法语词汇`} onClick={onClose}>
    <div className="confetti" aria-hidden="true">{Array.from({ length: pieces }, (_, index) => <i key={index} style={{ "--left": `${index * 37 % 100}%`, "--duration": `${2.4 + index % 5 * .25}s`, "--delay": `${(index % 7) * -.32}s`, "--color": `hsl(${index * 47 % 360} 55% 72%)`, "--rotation": `${index * 31}deg` } as React.CSSProperties} />)}</div>
    <section onClick={(event) => event.stopPropagation()}><span>{grand ? "✦ ✦ ✦" : "✦"}</span><p>{grand ? "Magnifique !" : "Félicitations !"}</p><h2>{milestone}</h2><strong>已学词汇</strong><small>{grand ? "百词里程碑！你的法语词汇量又迈上了新台阶。" : "你又完成了一个重要里程碑。"}</small><button onClick={onClose}>继续学习</button></section>
  </div>;
}
