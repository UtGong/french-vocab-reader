"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { QueueWord } from "./StudyQueue";

type LearnedWord = { id: number; word: string; phonetic: string; word_type_zh: string; meaning_zh: string; details_zh: string; source_word: string; learned_at: string };
type GraphMember = LearnedWord & { relation: string; confidence: number };
type GraphGroup = { id: number; name: string; type: string; description: string; members: GraphMember[] };
type GraphData = { groups: GraphGroup[]; pending: number };

const types = ["全部", "语义主题", "词根词族", "近义反义", "词形变化", "常用搭配", "语域", "拼写发音"];
const toQueue = (item: LearnedWord): QueueWord => ({ id: -item.id, word: item.word, phonetic: item.phonetic, word_type_zh: item.word_type_zh, meaning_zh: item.meaning_zh, details_zh: item.details_zh, source_word: item.source_word, created_at: item.learned_at });

export default function KnowledgeGraph({ learned, onReview }: { learned: LearnedWord[]; onReview: (items: QueueWord[]) => void }) {
  const [data, setData] = useState<GraphData>({ groups: [], pending: 0 });
  const [view, setView] = useState<"list" | "graph">("list");
  const [grouping, setGrouping] = useState<"smart" | "date">("smart");
  const [typeFilter, setTypeFilter] = useState("全部");
  const [selected, setSelected] = useState<number[]>([]);
  const [collapsed, setCollapsed] = useState<number[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [status, setStatus] = useState("正在加载词汇关系…");
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [newMember, setNewMember] = useState("");

  const load = useCallback(async () => {
    try { const response = await fetch("/api/knowledge-graph"); if (!response.ok) throw new Error(); const result = await response.json(); setData(result); setActiveGroupId((current) => current ?? result.groups[0]?.id ?? null); setStatus(result.groups.length ? "" : "尚未生成智能分组"); return result as GraphData; }
    catch { setStatus("词汇图谱加载失败，请重试"); return null; }
  }, []);

  const refresh = useCallback(async (force = false) => {
    setRefreshing(true); setStatus("AI 正在整理词汇关系…");
    try {
      let total = 0;
      while (true) {
        const response = await fetch("/api/knowledge-graph", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh", force }) });
        if (!response.ok) throw new Error();
        const result = await response.json();
        total += Number(result.refresh?.updated || 0); setData(result); setActiveGroupId((current) => current ?? result.groups[0]?.id ?? null);
        const pending = Number(result.pending || 0); setStatus(pending ? `已整理 ${total} 个词汇，剩余 ${pending} 个…` : total ? `已完成 ${total} 个词汇的智能分组` : "图谱已是最新");
        if (!force || !pending || !result.refresh?.updated) break;
      }
    }
    catch { setStatus("智能整理失败，请稍后重试"); }
    finally { setRefreshing(false); }
  }, []);

  useEffect(() => { let live = true; const timer = window.setTimeout(() => { load().then((result) => { if (live && result && !result.groups.length && learned.length) refresh(true); }); }, 0); return () => { live = false; window.clearTimeout(timer); }; }, [load, refresh, learned.length]);

  const filteredGroups = useMemo(() => data.groups.filter((group) => typeFilter === "全部" || group.type === typeFilter), [data.groups, typeFilter]);
  const dateGroups = useMemo(() => {
    const groups = new Map<string, LearnedWord[]>();
    learned.forEach((item) => { const label = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date(item.learned_at)); groups.set(label, [...(groups.get(label) ?? []), item]); });
    return Array.from(groups.entries());
  }, [learned]);
  const activeGroup = filteredGroups.find((group) => group.id === activeGroupId) ?? filteredGroups[0];
  const selectableWords = activeGroup ? learned.filter((word) => !activeGroup.members.some((member) => member.id === word.id)) : [];

  function toggleItems(items: LearnedWord[]) { const ids = items.map((item) => item.id); setSelected((current) => ids.every((id) => current.includes(id)) ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]); }
  function review(items?: LearnedWord[]) { const chosen = items ?? learned.filter((item) => selected.includes(item.id)); if (chosen.length) onReview(chosen.map(toQueue)); }
  async function removeMember(groupId: number, wordId: number) { const response = await fetch(`/api/knowledge-graph?groupId=${groupId}&wordId=${wordId}`, { method: "DELETE" }); if (response.ok) setData(await response.json()); }
  async function addMember() { if (!activeGroup || !newMember) return; const response = await fetch("/api/knowledge-graph", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "addMember", groupId: activeGroup.id, wordId: Number(newMember), relation: "用户确认的关联" }) }); if (response.ok) { setData(await response.json()); setNewMember(""); } }
  async function saveGroup() { if (!editingId || !editName.trim()) return; const response = await fetch("/api/knowledge-graph", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingId, name: editName, description: editDescription }) }); if (response.ok) { setData(await response.json()); setEditingId(null); } }

  return <section className="knowledge-graph">
    <div className="knowledge-heading"><div><p className="panel-kicker">已学词汇 · 多重关联</p><h3>词汇图谱</h3><p>按语义、词根、词族、用法和语言形式智能整理；每个词可属于多个分组。</p></div><div><button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>分组列表</button><button className={view === "graph" ? "active" : ""} onClick={() => { setView("graph"); setGrouping("smart"); }}>关系图</button></div></div>
    <div className="knowledge-toolbar"><div><button className={grouping === "smart" ? "active" : ""} onClick={() => setGrouping("smart")}>智能分组</button><button className={grouping === "date" ? "active" : ""} onClick={() => { setGrouping("date"); setView("list"); }}>学习时间</button></div>{grouping === "smart" && <select aria-label="关系类型" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>{types.map((type) => <option key={type}>{type}</option>)}</select>}<span>{data.groups.length} 个分组 · {data.pending} 个词待整理</span><button onClick={() => refresh(true)} disabled={refreshing || !learned.length}>{refreshing ? "整理中…" : "更新图谱"}</button></div>
    {status && <p className="knowledge-status">{status}</p>}
    {view === "list" && grouping === "smart" && <div className="knowledge-group-list">{filteredGroups.map((group) => <article key={group.id} className="knowledge-group-card"><header><span>{group.type}</span><div><h4>{group.name}</h4><p>{group.description}</p></div><em>{group.members.length} 个词</em><button onClick={() => setCollapsed((items) => items.includes(group.id) ? items.filter((id) => id !== group.id) : [...items, group.id])}>{collapsed.includes(group.id) ? "展开 +" : "收起 −"}</button></header>{!collapsed.includes(group.id) && <><div className="knowledge-group-actions"><button onClick={() => toggleItems(group.members)}>{group.members.every((item) => selected.includes(item.id)) ? "取消本组" : "全选本组"}</button><button onClick={() => review(group.members)}>复习本组</button><button onClick={() => { setActiveGroupId(group.id); setView("graph"); }}>查看关系图</button><button onClick={() => { setEditingId(group.id); setEditName(group.name); setEditDescription(group.description); }}>编辑分组</button></div><div className="knowledge-members">{group.members.map((member) => <label key={member.id}><input type="checkbox" checked={selected.includes(member.id)} onChange={() => setSelected((items) => items.includes(member.id) ? items.filter((id) => id !== member.id) : [...items, member.id])}/><div><b>{member.word}</b><span>{member.word_type_zh} · {member.meaning_zh}</span><small>{member.relation} · {Math.round(member.confidence * 100)}%</small></div><button aria-label={`从 ${group.name} 移除 ${member.word}`} onClick={(event) => { event.preventDefault(); removeMember(group.id, member.id); }}>移除</button></label>)}</div></>}</article>)}</div>}
    {view === "list" && grouping === "date" && <div className="knowledge-group-list">{dateGroups.map(([date, items]) => <article key={date} className="knowledge-group-card date-group"><header><span>学习日期</span><div><h4>{date}</h4><p>首次学习日期保持不变，复习不会重设日期。</p></div><em>{items.length} 个词</em></header><div className="knowledge-group-actions"><button onClick={() => toggleItems(items)}>{items.every((item) => selected.includes(item.id)) ? "取消本组" : "全选本组"}</button><button onClick={() => review(items)}>复习本日词汇</button></div><div className="date-word-cloud">{items.map((item) => <button className={selected.includes(item.id) ? "selected" : ""} key={item.id} onClick={() => setSelected((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])}>{item.word}<small>{item.meaning_zh}</small></button>)}</div></article>)}</div>}
    {view === "graph" && <div className="graph-layout"><aside>{filteredGroups.map((group) => <button key={group.id} className={activeGroup?.id === group.id ? "active" : ""} onClick={() => setActiveGroupId(group.id)}><span>{group.type}</span><b>{group.name}</b><small>{group.members.length} 个词</small></button>)}</aside>{activeGroup ? <div className="graph-canvas"><svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">{activeGroup.members.slice(0, 16).map((member, index, visible) => { const angle = index / visible.length * Math.PI * 2 - Math.PI / 2; return <line key={member.id} x1="50" y1="50" x2={50 + Math.cos(angle) * 38} y2={50 + Math.sin(angle) * 37}/>; })}</svg><button className="graph-center" onClick={() => { setEditingId(activeGroup.id); setEditName(activeGroup.name); setEditDescription(activeGroup.description); }}><small>{activeGroup.type}</small><b>{activeGroup.name}</b><span>{activeGroup.description}</span></button>{activeGroup.members.slice(0, 16).map((member, index, visible) => { const angle = index / visible.length * Math.PI * 2 - Math.PI / 2; return <button key={member.id} className="graph-node" style={{ left: `${50 + Math.cos(angle) * 38}%`, top: `${50 + Math.sin(angle) * 37}%` }} title={member.relation} onClick={() => review([member])}><b>{member.word}</b><small>{member.meaning_zh}</small></button>; })}</div> : <p className="empty">没有符合筛选条件的分组。</p>}</div>}
    {selected.length > 0 && <div className="knowledge-selection"><span>已选 {selected.length} 个词</span><button onClick={() => review()}>复习已选</button><button onClick={() => setSelected([])}>取消选择</button></div>}
    {editingId && <div className="knowledge-editor"><div><h4>编辑分组</h4><label>名称<input value={editName} onChange={(event) => setEditName(event.target.value)}/></label><label>说明<textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)}/></label>{activeGroup?.id === editingId && <label>添加已学词<select value={newMember} onChange={(event) => setNewMember(event.target.value)}><option value="">选择词汇</option>{selectableWords.map((word) => <option key={word.id} value={word.id}>{word.word} · {word.meaning_zh}</option>)}</select></label>}<div><button onClick={() => setEditingId(null)}>取消</button>{activeGroup?.id === editingId && <button onClick={addMember} disabled={!newMember}>添加词汇</button>}<button className="primary" onClick={saveGroup}>保存修改</button></div></div></div>}
  </section>;
}
