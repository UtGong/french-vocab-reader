import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("connects AI results to the persistent study queue", async () => {
  const [explorer, queueRoute, database] = await Promise.all([
    read("../app/components/VocabExplorer.tsx"), read("../app/api/queue/route.ts"), read("../lib/db.ts"),
  ]);
  assert.match(explorer, /fetch\("\/api\/queue"/);
  assert.match(explorer, /result\.relatedWords\.map/);
  assert.match(explorer, /result\.synonyms\.map/);
  assert.match(explorer, /result\.patternWords\.map/);
  assert.match(explorer, /加入学习清单/);
  assert.match(explorer, /取消全选/);
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
  assert.match(queue, /标为已学/);
  assert.match(queue, /删除/);
  assert.match(queue, /删除已选/);
  assert.match(queue, /className="queue-table"/);
  assert.match(page, /确认文本并生成词义/);
  assert.match(page, /fetch\("\/api\/analyze-text"/);
  assert.doesNotMatch(page, /fetch\("\/api\/analyze"/);
  const prepareText = page.slice(page.indexOf("async function prepareText"), page.indexOf("async function deleteQueueWord"));
  assert.doesNotMatch(prepareText, /fetch\("\/api\/queue"/);
  assert.match(page, /移回学习清单/);
  assert.match(page, /deleteLearnedWord/);
  assert.match(page, /const sample = "Je t’aime\."/);
  assert.match(page, /word: "Je", word_type_zh: "代词", meaning_zh: "我"/);
  assert.match(page, />法语文本</);
  assert.match(page, />切换到下一个词</);
  assert.match(page, />开始</);
  assert.match(page, /selectedLearned/);
  assert.match(page, /deleteSelectedLearned/);
});

test("prevents duplicates within and across persistent lists", async () => {
  const [wordsRoute, queueRoute] = await Promise.all([read("../app/api/words/route.ts"), read("../app/api/queue/route.ts")]);
  assert.match(wordsRoute, /LOWER\(word\) = LOWER\(\$\{word\}\)/);
  assert.match(wordsRoute, /DELETE FROM study_queue WHERE LOWER\(word\)/);
  assert.match(queueRoute, /SELECT 1 FROM learned_words WHERE LOWER\(word\)/);
  assert.match(queueRoute, /DELETE FROM study_queue q USING learned_words l/);
  assert.match(queueRoute, /DELETE FROM study_queue a USING study_queue b/);
});

test("uses the configured Hugging Face model without exposed credentials", async () => {
  const helper = await read("../lib/huggingface.ts");
  assert.match(helper, /Qwen\/Qwen3\.5-27B:novita/);
  assert.match(helper, /process\.env\.HF_TOKEN/);
  assert.match(helper, /enable_thinking: false/);
  assert.doesNotMatch(helper, /hf_[A-Za-z0-9]+/);
});
