"use client";

import { useRef, useState } from "react";
import { unzipSync } from "fflate";
import type { QueueWord } from "./StudyQueue";

type ImportWord = Pick<QueueWord, "word" | "phonetic" | "word_type_zh" | "meaning_zh" | "details_zh" | "source_word">;
type Props = { onImported: () => void };
const norm = (value: string) => value.toLocaleLowerCase("zh-CN").replace(/[\s/_-]+/g, "");
const headerGroups = {
  surface: ["原文词", "原文词表达", "法语词", "法语单词", "词语", "表达", "单词", "word", "expression", "forme"],
  lemma: ["词语原型", "词汇原型", "词语原形", "词汇原形", "词原型", "原型", "原形", "lemma", "headword", "forme canonique"],
  pos: ["词性", "partiedudiscours", "partofspeech", "pos", "naturegrammaticale"],
  meaning: ["中文意思", "中文释义", "中文解释", "意思", "释义", "解释", "meaning", "translation", "sens"],
};
const simplifyPos = (raw: string) => {
  const value = raw.toLowerCase();
  if (value.includes("loc.") || value.includes("phrase") || value.includes("locution")) return "短语";
  if (value.includes("v.") || value.includes("verbe")) return value.includes("pron") ? "动词" : "动词";
  if (value.includes("adj") || value.includes("adjectif")) return "形容词";
  if (value.includes("adv") || value.includes("adverbe")) return "副词";
  if (value.includes("prép") || value.includes("preposition") || value.includes("préposition")) return "介词";
  if (value.includes("conj") || value.includes("conjonction")) return "连词";
  if (value.includes("pron")) return "代词";
  if (value.includes("art.") || value.includes("déterminant")) return "冠词";
  if (value.includes("num")) return "数词";
  if (value.includes("interj")) return "感叹词";
  if (value.includes("n") || value.includes("nom")) return "名词";
  return "其他";
};
const cellText = (cell: Element) => Array.from(cell.getElementsByTagNameNS("*", "t")).map((node) => node.textContent ?? "").join("").replace(/\s+/g, " ").trim();

function parseDocx(buffer: ArrayBuffer, filename: string): { words: ImportWord[]; skipped: number } {
  const files = unzipSync(new Uint8Array(buffer));
  const document = files["word/document.xml"];
  if (!document) throw new Error("找不到 Word 文档正文");
  const xml = new DOMParser().parseFromString(new TextDecoder().decode(document), "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("Word 文档结构无法识别");
  const tables = Array.from(xml.getElementsByTagNameNS("*", "tbl"));
  const words: ImportWord[] = [];
  let skipped = 0;
  for (const table of tables) {
    const rows = Array.from(table.getElementsByTagNameNS("*", "tr")).filter((row) => row.parentElement?.localName === "tbl");
    if (rows.length < 2) continue;
    const firstRow = Array.from(rows[0].children).filter((cell) => cell.localName === "tc").map(cellText);
    const findColumn = (kind: keyof typeof headerGroups) => firstRow.findIndex((header) => headerGroups[kind].some((known) => norm(header).includes(norm(known))));
    const columns = { surface: findColumn("surface"), lemma: findColumn("lemma"), pos: findColumn("pos"), meaning: findColumn("meaning") };
    if (columns.lemma < 0 && columns.surface < 0 || columns.meaning < 0) continue;
    for (const row of rows.slice(1)) {
      const cells = Array.from(row.children).filter((cell) => cell.localName === "tc").map(cellText);
      const original = cells[columns.surface] ?? "", lemma = cells[columns.lemma] ?? original;
      const rawPos = columns.pos >= 0 ? cells[columns.pos] ?? "" : "", meaning = cells[columns.meaning] ?? "";
      if (!lemma || !meaning) { skipped += 1; continue; }
      words.push({ word: lemma, phonetic: "", word_type_zh: simplifyPos(rawPos), meaning_zh: meaning, details_zh: [original && norm(original) !== norm(lemma) ? `原文词形：${original}` : "", rawPos ? `法语词性：${rawPos}` : ""].filter(Boolean).join("；"), source_word: filename.slice(0, 120) || "Word 文档导入" });
    }
  }
  if (!words.length) throw new Error("没有识别到词汇表。请检查表头是否包含原型、词性和中文意思。");
  return { words, skipped };
}

export default function DocumentImporter({ onImported }: Props) {
  const [words, setWords] = useState<ImportWord[]>([]), [selected, setSelected] = useState<number[]>([]), [target, setTarget] = useState<"queue" | "learned">("queue");
  const [filename, setFilename] = useState(""), [skipped, setSkipped] = useState(0), [message, setMessage] = useState(""), [error, setError] = useState(""), [loading, setLoading] = useState(false), [importing, setImporting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function loadFile(file?: File) {
    if (!file) return;
    setError(""); setMessage(""); setWords([]); setSelected([]);
    if (!file.name.toLowerCase().endsWith(".docx")) { setError("目前支持 .docx 格式，请将旧版 .doc 另存为 .docx 后导入。"); return; }
    if (file.size > 20 * 1024 * 1024) { setError("文档不能超过 20 MB。"); return; }
    setLoading(true);
    try {
      const parsed = parseDocx(await file.arrayBuffer(), file.name);
      const unique = new Map<string, ImportWord>();
      parsed.words.forEach((word) => unique.set(norm(word.word), word));
      const items = Array.from(unique.values());
      setWords(items); setSelected(items.map((_, index) => index)); setSkipped(parsed.skipped + parsed.words.length - items.length); setFilename(file.name);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "读取 Word 文档失败"); }
    finally { setLoading(false); if (input.current) input.current.value = ""; }
  }
  async function importSelected() {
    if (!selected.length || importing) return;
    setImporting(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/import-vocabulary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target, items: selected.map((index) => { const item = words[index]; return { word: item.word, phonetic: item.phonetic, wordType: item.word_type_zh, meaning: item.meaning_zh, details: item.details_zh, sourceWord: item.source_word }; }) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "导入失败");
      setMessage(`已导入 ${data.saved} 个词${data.skipped ? `，跳过 ${data.skipped} 个重复或无效词` : ""}。`);
      onImported();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "导入失败，请重试"); }
    finally { setImporting(false); }
  }
  const allSelected = words.length > 0 && selected.length === words.length;
  return <section className="document-importer"><div className="explorer-heading"><div><p className="panel-kicker">从 Word 词汇表导入</p><h3>导入词汇</h3></div><span>仅在本机读取文件</span></div><p className="import-intro">识别表格中的法语原型、词性和中文意思。导入前可预览并选择词条；原文词形和法语词性会保存在“关系 / 用法”中。</p><div className="import-file-row"><input ref={input} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => loadFile(event.target.files?.[0])} aria-label="选择 Word 文档"/><small>支持 .docx，最大 20 MB</small>{loading && <span>正在读取文档…</span>}</div>{error && <p className="explorer-error">{error}</p>}{message && <p className="import-message">{message}</p>}{words.length > 0 && <><div className="import-summary"><b>{filename}</b><span>{words.length} 个词条{skipped ? ` · 已忽略 ${skipped} 行或重复词` : ""}</span></div><div className="import-actions"><button onClick={() => setSelected(allSelected ? [] : words.map((_, index) => index))}>{allSelected ? "取消全选" : "全选"}</button><label>导入到<select value={target} onChange={(event) => setTarget(event.target.value as "queue" | "learned")}><option value="queue">待学习</option><option value="learned">已学</option></select></label><button className="import-submit" onClick={importSelected} disabled={!selected.length || importing}>{importing ? "正在导入…" : `导入选中（${selected.length}）`}</button></div><div className="table-wrap import-table"><table><thead><tr><th>选择</th><th>原文词 / 表达</th><th>词语原型（将导入）</th><th>词性</th><th>中文意思</th></tr></thead><tbody>{words.map((word, index) => <tr key={`${word.word}-${index}`}><td><input type="checkbox" aria-label={`选择 ${word.word}`} checked={selected.includes(index)} onChange={() => setSelected((items) => items.includes(index) ? items.filter((item) => item !== index) : [...items, index])}/></td><td>{word.details_zh.match(/原文词形：([^；]+)/)?.[1] || word.word}</td><td>{word.word}</td><td><span className="type-badge">{word.word_type_zh}</span>{word.details_zh.match(/法语词性：([^；]+)/)?.[1] && <small>{word.details_zh.match(/法语词性：([^；]+)/)?.[1]}</small>}</td><td>{word.meaning_zh}</td></tr>)}</tbody></table></div></>}</section>;
}
