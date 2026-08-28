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
  assert.match(explorer, /加入待学习/);
  assert.match(explorer, /取消全选/);
  assert.match(explorer, /全部收起/);
  assert.match(explorer, /全部展开/);
  assert.match(explorer, /className="fold-heading"/);
  assert.match(explorer, /全选本组/);
  assert.match(explorer, /toggleSectionSelection/);
  assert.match(explorer, /aria-expanded/);
  assert.match(queueRoute, /export async function GET/);
  assert.match(queueRoute, /export async function POST/);
  assert.match(queueRoute, /export async function DELETE/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS study_queue/);
});

test("supports selecting, studying, and completing queued words", async () => {
  const [page, queue] = await Promise.all([read("../app/page.tsx"), read("../app/components/StudyQueue.tsx")]);
  assert.match(queue, /待学习/);
  assert.match(queue, /学习已选词汇/);
  assert.match(page, /className="study-sides"/);
  assert.match(page, /className="french-side"/);
  assert.match(page, /className="chinese-side"/);
  assert.doesNotMatch(page, /className="save-panel"/);
  assert.match(page, /async function completeCurrentWord/);
  assert.match(page, /fetch\("\/api\/words"/);
  assert.match(page, /fetch\(`\/api\/queue\?id=/);
  assert.match(page, /await completeCurrentWord/);
  assert.match(queue, /标为已学/);
  assert.match(queue, /删除/);
  assert.match(queue, /删除已选/);
  assert.match(queue, /className="queue-table"/);
  assert.match(queue, /className="vocab-group"/);
  assert.match(queue, /关系 \/ 用法/);
  assert.match(page, /确认文本并生成词义/);
  assert.match(page, /fetch\("\/api\/analyze-text"/);
  assert.doesNotMatch(page, /fetch\("\/api\/analyze"/);
  const prepareText = page.slice(page.indexOf("async function prepareText"), page.indexOf("async function saveSelectedPreview"));
  assert.doesNotMatch(prepareText, /fetch\("\/api\/queue"/);
  assert.match(page, /移回待学习/);
  assert.match(page, /deleteLearnedWord/);
  assert.match(page, /const sample = "Je t’aime\."/);
  assert.match(page, /word: "Je", phonetic: "\/ʒə\/", word_type_zh: "代词", meaning_zh: "我"/);
  assert.match(page, />法语文本</);
  assert.match(page, />开始</);
  assert.match(page, /selectedLearned/);
  assert.match(page, /deleteSelectedLearned/);
  assert.match(page, /learnedGroups\.map/);
  assert.match(page, /details: item\.details_zh/);
  assert.doesNotMatch(page, /SpeechRecognition|webkitSpeechRecognition|chooseAdvance|正在等待“OK”/);
  assert.match(page, /speechSynthesis\.getVoices\(\)\.filter/);
  assert.match(page, /startsWith\("fr"\)/);
  assert.match(page, /speechSynthesis\.resume\(\)/);
  assert.match(page, /下一个单词 →/);
  assert.match(page, /← 上一个单词/);
  assert.match(page, /function previous\(\)/);
  assert.match(page, /disabled=\{index <= 0\}/);
  assert.match(page, /目标法语等级/);
  assert.match(page, /frenchLevels = \["A1", "A2", "B1", "B2", "C1", "C2"\]/);
  assert.match(page, /JSON\.stringify\(\{ words: batch, targetLevel \}\)/);
});

test("uses the selected CEFR level in both AI features", async () => {
  const [page, explorer, analyzeText, explore] = await Promise.all([
    read("../app/page.tsx"), read("../app/components/VocabExplorer.tsx"),
    read("../app/api/analyze-text/route.ts"), read("../app/api/explore/route.ts"),
  ]);
  assert.match(page, /targetLevel=\{targetLevel\}/);
  assert.match(explorer, /JSON\.stringify\(\{ word: word\.trim\(\), targetLevel \}\)/);
  assert.match(analyzeText, /CEFR \$\{targetLevel\} French exam/);
  assert.match(explore, /CEFR \$\{targetLevel\} French exam/);
  assert.match(analyzeText, /allowedLevels\.has\(body\.targetLevel\)/);
  assert.match(explore, /allowedLevels\.has\(body\.targetLevel\)/);
});

test("prevents duplicates within and across persistent lists", async () => {
  const [wordsRoute, queueRoute] = await Promise.all([read("../app/api/words/route.ts"), read("../app/api/queue/route.ts")]);
  assert.match(wordsRoute, /LOWER\(word\) = LOWER\(\$\{word\}\)/);
  assert.match(wordsRoute, /DELETE FROM study_queue WHERE user_id = \$\{user\.id\} AND LOWER\(word\)/);
  assert.match(queueRoute, /SELECT 1 FROM learned_words WHERE user_id = \$\{user\.id\} AND LOWER\(word\)/);
  assert.match(queueRoute, /DELETE FROM study_queue q USING learned_words l/);
  assert.match(queueRoute, /DELETE FROM study_queue a USING study_queue b/);
});

test("preserves grouping context when words move between lists", async () => {
  const [database, wordsRoute] = await Promise.all([read("../lib/db.ts"), read("../app/api/words/route.ts")]);
  assert.match(database, /ALTER TABLE learned_words ADD COLUMN IF NOT EXISTS details_zh/);
  assert.match(database, /ALTER TABLE learned_words ADD COLUMN IF NOT EXISTS source_word/);
  assert.match(wordsRoute, /details_zh, source_word, learned_at/);
  assert.match(wordsRoute, /details_zh = \$\{details\}, source_word = \$\{sourceWord\}/);
});

test("uses the configured SCNet model without exposed credentials", async () => {
  const helper = await read("../lib/scnet.ts");
  assert.match(helper, /Qwen3\.8-Max/);
  assert.match(helper, /process\.env\.SCNET_API_KEY/);
  assert.match(helper, /api\.scnet\.cn\/api\/llm\/v1/);
  assert.match(helper, /process\.env\.SCNET_MODEL/);
  assert.match(helper, /AbortSignal\.timeout\(50000\)/);
  assert.match(helper, /response_format: \{ type: "json_object" \}/);
  assert.match(helper, /enable_thinking: false/);
  assert.match(helper, /replace\(\/\^```\(\?:json\)\?/);
  assert.doesNotMatch(helper, /hf_[A-Za-z0-9]+/);
});

test("authenticates users and scopes vocabulary data by account", async () => {
  const [auth, authRoute, database, wordsRoute, queueRoute, page] = await Promise.all([
    read("../lib/auth.ts"), read("../app/api/auth/route.ts"), read("../lib/db.ts"),
    read("../app/api/words/route.ts"), read("../app/api/queue/route.ts"), read("../app/page.tsx"),
  ]);
  assert.match(auth, /httpOnly: true/);
  assert.match(auth, /sameSite: "lax"/);
  assert.match(auth, /scryptSync/);
  assert.match(authRoute, /action === "register"/);
  assert.match(authRoute, /action === "login"/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS app_users/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS user_sessions/);
  assert.match(database, /learned_words_user_word_unique/);
  assert.match(database, /study_queue_user_word_unique/);
  assert.match(wordsRoute, /user_id = \$\{user\.id\}/);
  assert.match(queueRoute, /user_id = \$\{user\.id\}/);
  assert.match(page, /<AuthGate>/);
});

test("provides an accurate countdown timer and stopwatch", async () => {
  const [page, timer] = await Promise.all([read("../app/page.tsx"), read("../app/components/StudyTimer.tsx")]);
  assert.match(page, /<StudyTimer \/>/);
  assert.match(timer, /倒计时/);
  assert.match(timer, /秒表/);
  assert.match(timer, /timerEnd\.current - Date\.now\(\)/);
  assert.match(timer, /stopwatchBase\.current/);
  assert.match(timer, /signalFinished/);
  assert.match(timer, /className="timer-compact-bar"/);
  assert.match(timer, /计时设置/);
  assert.match(timer, /aria-expanded=\{expanded\}/);
  assert.ok(page.indexOf("<StudyTimer />") < page.indexOf("className=\"player\""));
});

test("supports first-date grouping and review without changing learned dates", async () => {
  const [page, wordsRoute] = await Promise.all([read("../app/page.tsx"), read("../app/api/words/route.ts")]);
  assert.match(page, /按首次学习日期/);
  assert.match(page, /复习已选/);
  assert.match(page, /studyMode\.current === "review"/);
  assert.match(page, /beginStudy\(selected, "review"\)/);
  assert.doesNotMatch(wordsRoute, /source_word = \$\{sourceWord\}, learned_at = NOW\(\)/);
});

test("previews analyzed text with IPA before learning", async () => {
  const [page, analyze] = await Promise.all([read("../app/page.tsx"), read("../app/api/analyze-text/route.ts")]);
  assert.match(page, /className="text-preview"/);
  assert.match(page, /学习已选词汇/);
  assert.doesNotMatch(page.slice(page.indexOf("async function prepareText"), page.indexOf("async function deleteQueueWord")), /beginStudy\(prepared\)/);
  assert.match(analyze, /French IPA enclosed in \/slashes\//);
  assert.match(page, /uniqueWords/);
  assert.match(page, /uniqueWords\.length \/ 8/);
  assert.match(page, /index \+= 2/);
  assert.match(page, /attempt < 1/);
  assert.match(analyze, /slice\(0, 24\)/);
  assert.match(analyze, /maxDuration = 60/);
  assert.match(analyze, /"isFrench":true/);
  assert.match(analyze, /grises has lemma gris/);
  assert.match(analyze, /原形（来自/);
  assert.match(page, /含必要原形/);
  assert.doesNotMatch(page, /prepared\.length !== parsed\.length/);
});

test("uses FLELex to constrain CEFR suggestions and generates learned-word sentences", async () => {
  const [lexicon, explore, sentence, page] = await Promise.all([
    read("../lib/cefr-lexicon.ts"), read("../app/api/explore/route.ts"),
    read("../app/api/generate-sentence/route.ts"), read("../app/page.tsx"),
  ]);
  assert.match(lexicon, /flelex-beacco\.json/);
  assert.match(explore, /isAtOrBelowTarget/);
  assert.match(sentence, /ORDER BY RANDOM\(\) LIMIT 5/);
  assert.match(sentence, /Maximize reuse of these learned words/);
  assert.match(page, /<SentencePractice targetLevel=\{targetLevel\}/);
  assert.match(page, /currentPhonetic/);
});

test("keeps secondary controls in settings and provides a simple dictionary", async () => {
  const [page, dictionary] = await Promise.all([read("../app/page.tsx"), read("../app/components/Dictionary.tsx")]);
  assert.match(page, /<details className="settings-panel">/);
  assert.doesNotMatch(page, /<details className="settings-panel" open/);
  assert.match(page, /<Dictionary onUpdated=/);
  assert.match(page, />法语词典</);
  assert.match(dictionary, /fetch\("\/api\/analyze"/);
  assert.match(dictionary, /startsWith\("fr"\)/);
  assert.match(dictionary, /speechSynthesis\.speak/);
  assert.match(dictionary, /activeUtterance/);
  assert.match(dictionary, /window\.setTimeout/);
  assert.doesNotMatch(dictionary, /speechSynthesis\.resume\(\)/);
  assert.match(dictionary, /utterance\.lang = "fr-FR"/);
  assert.match(dictionary, /加入待学习/);
  assert.match(dictionary, /标为已学/);
  assert.match(dictionary, /fetch\(destination === "queue" \? "\/api\/queue" : "\/api\/words"/);
  assert.match(page, /全选本组/);
  assert.match(page, /toggleLearnedGroup/);
  assert.match(page, /previewOpen/);
  assert.match(page, /saveSelectedPreview\("queue"\)/);
  assert.match(page, /saveSelectedPreview\("learned"\)/);
  assert.match(page, /加入待学习（\{selectedPreview\.length\}）/);
  assert.match(page, /标为已学（\{selectedPreview\.length\}）/);
  assert.match(page, /删除已选（\{selectedPreview\.length\}）/);
  assert.match(page, /function deleteSelectedPreview\(\)/);
  assert.match(page, /id: -\(itemIndex \+ 1\)/);
});

test("celebrates learned vocabulary milestones once per user", async () => {
  const [page, celebration, css] = await Promise.all([read("../app/page.tsx"), read("../app/components/MilestoneCelebration.tsx"), read("../app/learned.css")]);
  assert.match(page, /Math\.floor\(learned\.length \/ 25\) \* 25/);
  assert.match(page, /french-vocab-milestones:\$\{email\}/);
  assert.match(page, /localStorage\.setItem/);
  assert.match(page, /<MilestoneCelebration/);
  assert.match(celebration, /Félicitations/);
  assert.match(celebration, /6000/);
  assert.match(celebration, /milestone % 100 === 0/);
  assert.match(celebration, /pieces = grand \? 56 : 28/);
  assert.match(css, /milestone-celebration\.grand/);
  assert.match(css, /@keyframes confetti-fall/);
  assert.match(css, /prefers-reduced-motion/);
});

test("builds an editable multi-group vocabulary knowledge graph every five new words", async () => {
  const [database, service, route, component, wordsRoute, page, css] = await Promise.all([
    read("../lib/db.ts"), read("../lib/knowledge-graph.ts"), read("../app/api/knowledge-graph/route.ts"),
    read("../app/components/KnowledgeGraph.tsx"), read("../app/api/words/route.ts"), read("../app/page.tsx"), read("../app/learned.css"),
  ]);
  assert.match(database, /CREATE TABLE IF NOT EXISTS vocabulary_groups/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS vocabulary_group_members/);
  assert.match(database, /knowledge_analyzed_at/);
  assert.match(service, /pending\.length < 5/);
  assert.match(service, /Put every input word in 2-4 genuinely useful groups/);
  assert.match(service, /Do not group by source, learning date/);
  assert.match(wordsRoute, /after\(async \(\) =>/);
  assert.match(wordsRoute, /refreshKnowledgeGraph\(user\.id\)/);
  assert.match(route, /body\.action === "refresh"/);
  assert.match(route, /body\.action === "addMember"/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /export async function DELETE/);
  assert.match(component, /分组列表/);
  assert.match(component, /关系图/);
  assert.match(component, /学习时间/);
  assert.match(component, /全选本组/);
  assert.match(component, /复习本组/);
  assert.match(component, /编辑分组/);
  assert.match(page, />词汇图谱</);
  assert.match(page, /<KnowledgeGraph learned=\{learned\}/);
  assert.match(css, /\.graph-canvas/);
  assert.match(css, /\.knowledge-group-card/);
});
