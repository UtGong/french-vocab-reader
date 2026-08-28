import entries from "@/data/flelex-beacco.json";

type Entry = { w: string; p: string; l: string; f: number };
const levels = ["A1", "A2", "B1", "B2", "C1", "C2"];
const normalized = (word: string) => word.trim().toLocaleLowerCase("fr").replace(/[’']/g, "'");
const byWord = new Map<string, Entry[]>();
for (const entry of entries as Entry[]) { const key = normalized(entry.w); byWord.set(key, [...(byWord.get(key) ?? []), entry]); }

export function getCefrLevel(word: string) {
  const matches = byWord.get(normalized(word));
  if (!matches?.length) return null;
  return [...matches].sort((a, b) => b.f - a.f)[0].l;
}

export function isAtOrBelowTarget(word: string, target: string) {
  const level = getCefrLevel(word), targetIndex = levels.indexOf(target), levelIndex = level ? levels.indexOf(level) : -1;
  return Boolean(level && targetIndex >= 0 && levelIndex >= 0 && levelIndex <= targetIndex);
}

export function getCefrPromptContext(word: string, target: string) {
  const prefix = normalized(word).slice(0, 3), targetEntries = (entries as Entry[])
    .filter((entry) => entry.l === target && (normalized(entry.w).startsWith(prefix) || entry.f >= 25))
    .sort((a, b) => (normalized(b.w).startsWith(prefix) ? 1 : 0) - (normalized(a.w).startsWith(prefix) ? 1 : 0) || b.f - a.f)
    .slice(0, 120).map((entry) => entry.w);
  return { inputLevel: getCefrLevel(word), verifiedTargetExamples: targetEntries };
}

export const cefrLexiconSource = "FLELex / Beacco, CENTAL UCLouvain, CC BY-NC-SA 4.0";
