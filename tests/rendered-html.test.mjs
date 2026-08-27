import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("connects AI results to the persistent study queue", async () => {
  const [explorer, queueRoute, database] = await Promise.all([
    read("../app/components/VocabExplorer.tsx"), read("../app/api/queue/route.ts"), read("../lib/db.ts"),
  ]);
  assert.match(explorer, /fetch\("\/api\/queue"/);
  assert.match(explorer, /generated\.relatedWords\.map/);
  assert.match(explorer, /generated\.synonyms\.map/);
  assert.match(queueRoute, /export async function GET/);
  assert.match(queueRoute, /export async function POST/);
  assert.match(queueRoute, /export async function DELETE/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS study_queue/);
});

test("supports selecting, studying, and completing queued words", async () => {
  const [page, queue] = await Promise.all([read("../app/page.tsx"), read("../app/components/StudyQueue.tsx")]);
  assert.match(queue, /学习清单/);
  assert.match(queue, /学习已选词汇/);
  assert.match(page, /className="study-sides"/);
  assert.match(page, /className="french-side"/);
  assert.match(page, /className="chinese-side"/);
  assert.match(page, /async function completeCurrentWord/);
  assert.match(page, /fetch\("\/api\/words"/);
  assert.match(page, /fetch\(`\/api\/queue\?id=/);
  assert.match(page, /await completeCurrentWord/);
  assert.match(page, /确认文本并生成词义/);
  assert.match(page, /fetch\("\/api\/analyze-text"/);
  assert.doesNotMatch(page, /fetch\("\/api\/analyze"/);
});

test("uses the configured Hugging Face model without exposed credentials", async () => {
  const helper = await read("../lib/huggingface.ts");
  assert.match(helper, /Qwen\/Qwen3\.5-27B:novita/);
  assert.match(helper, /process\.env\.HF_TOKEN/);
  assert.match(helper, /enable_thinking: false/);
  assert.doesNotMatch(helper, /hf_[A-Za-z0-9]+/);
});
