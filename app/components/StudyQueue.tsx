"use client";

import { useMemo, useState } from "react";

export type QueueWord = { id: number; word: string; word_type_zh: string; meaning_zh: string; details_zh: string; source_word: string; created_at: string };

export default function StudyQueue({ items, onStart }: { items: QueueWord[]; onStart: (items: QueueWord[]) => void }) {
  const [selected, setSelected] = useState<number[]>([]);
  const chosen = useMemo(() => items.filter((item) => selected.includes(item.id)), [items, selected]);
  function toggle(id: number) { setSelected((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]); }

  return <section className="study-queue">
    <div className="list-title"><h3>学习清单</h3><span>{items.length}</span></div>
    {items.length === 0 ? <p className="empty">AI 生成的词汇会自动加入这里。</p> : <>
      <div className="queue-actions"><button onClick={() => setSelected(selected.length === items.length ? [] : items.map((item) => item.id))}>{selected.length === items.length ? "取消全选" : "全选"}</button><button className="queue-start" disabled={!chosen.length} onClick={() => onStart(chosen)}>学习已选词汇（{chosen.length}）</button></div>
      <div className="queue-grid">{items.map((item) => <label key={item.id} className={selected.includes(item.id) ? "chosen" : ""}><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /><div><b>{item.word}</b><small>{item.word_type_zh} · {item.meaning_zh}</small>{item.details_zh && <em>{item.details_zh}</em>}</div></label>)}</div>
    </>}
  </section>;
}
