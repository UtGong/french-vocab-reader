import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { askLanguageModel } from "@/lib/scnet";

export const maxDuration = 60;
const clean = (value: unknown, limit: number) => typeof value === "string" ? value.trim().slice(0, limit) : "";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = await request.json();
    const question = clean(body.question, 600), frenchText = clean(body.frenchText, 2600), translation = clean(body.translation, 2600);
    if (!question || !frenchText) return NextResponse.json({ error: "请输入关于当前内容的问题" }, { status: 400 });
    const vocabulary = Array.isArray(body.vocabulary) ? body.vocabulary.slice(0, 100).map((item: Record<string, unknown>) => ({ word: clean(item.word, 120), wordType: clean(item.wordType, 40), meaning: clean(item.meaning, 300) })) : [];
    const history = Array.isArray(body.history) ? body.history.slice(-8).map((item: Record<string, unknown>) => ({ role: item.role === "assistant" ? "assistant" : "user", content: clean(item.content, 800) })) : [];
    const result = await askLanguageModel(`Help a Chinese-speaking learner understand the following generated French text.

FRENCH TEXT: ${frenchText}
REFERENCE CHINESE TRANSLATION: ${translation}
VOCABULARY METADATA: ${JSON.stringify(vocabulary)}
RECENT CONVERSATION: ${JSON.stringify(history)}
USER QUESTION: ${question}

Answer the question directly and accurately. Explain in concise Simplified Chinese by default, preserving useful French examples. If the user explicitly requests French, answer in French. Ground the answer in the supplied text; clearly say when a question is unrelated or cannot be determined. Return exactly JSON: {"answer":"answer"}.`, 1000);
    const answer = clean(result.answer, 2400);
    if (!answer) throw new Error("Empty chat answer");
    return NextResponse.json({ answer });
  } catch (error) {
    console.error("Unable to answer creative-text question", error);
    return NextResponse.json({ error: "回答失败，请重试" }, { status: 502 });
  }
}
