"use client";

import { Fragment, useMemo, useState } from "react";

export type QueueWord = { id: number; word: string; phonetic: string; word_type_zh: string; meaning_zh: string; details_zh: string; source_word: string; created_at: string };

export default function StudyQueue({ items, onStart, onDelete, onLearned }: { items: QueueWord[]; onStart: (items: QueueWord[]) => void; onDelete: (id: number) => void; onLearned: (item: QueueWord) => void }) {
  const [selected, setSelected] = useState<number[]>([]);
  const chosen = useMemo(() => items.filter((item) => selected.includes(item.id)), [items, selected]);
  const groups = useMemo(() => {
    const grouped = new Map<string, QueueWord[]>();
    items.forEach((item) => {
      const name = item.source_word || "独立词汇";
      grouped.set(name, [...(grouped.get(name) ?? []), item]);
    });
    return Array.from(grouped.entries());
  }, [items]);
  const dateLabel = (value: string) => value ? new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value)) : "—";
  function toggle(id: number) { setSelected((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]); }

  return <section className="study-queue">
    <div className="list-title"><h3>待学习</h3><span>{items.length}</span></div>
    {items.length === 0 ? <p className="empty">智能生成的词汇会自动加入这里。</p> : <>
      <div className="queue-actions"><button onClick={() => setSelected(selected.length === items.length ? [] : items.map((item) => item.id))}>{selected.length === items.length ? "取消全选" : "全选"}</button><div><button className="danger-link" disabled={!chosen.length} onClick={() => { chosen.forEach((item) => onDelete(item.id)); setSelected([]); }}>删除已选（{chosen.length}）</button><button className="queue-start" disabled={!chosen.length} onClick={() => onStart(chosen)}>学习已选词汇（{chosen.length}）</button></div></div>
      <div className="table-wrap vocabulary-storage"><table className="queue-table"><thead><tr><th>选择</th><th>法语</th><th>词性</th><th>中文释义</th><th>关系 / 用法</th><th>加入日期</th><th>操作</th></tr></thead><tbody>{groups.map(([group, groupItems]) => <Fragment key={group}><tr className="vocab-group"><th colSpan={7}><span>词汇组</span><b>{group}</b><em>{groupItems.length} 个词</em></th></tr>{groupItems.map((item) => <tr key={item.id} className={selected.includes(item.id) ? "chosen" : ""}><td><input aria-label={`选择 ${item.word}`} type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /></td><td>{item.word}</td><td><span className="type-badge">{item.word_type_zh}</span></td><td>{item.meaning_zh}</td><td className="detail-cell">{item.details_zh || "独立词汇"}</td><td className="date-cell">{dateLabel(item.created_at)}</td><td><div className="row-actions"><button onClick={() => { setSelected((ids) => ids.filter((id) => id !== item.id)); onLearned(item); }}>标为已学</button><button className="danger-link" onClick={() => { setSelected((ids) => ids.filter((id) => id !== item.id)); onDelete(item.id); }}>删除</button></div></td></tr>)}</Fragment>)}</tbody></table></div>
    </>}
  </section>;
}
