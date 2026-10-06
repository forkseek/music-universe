"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { GuideOutput } from "@/lib/ai/guide-contract";

interface GuidePanelProps {
  worldId: string;
  nodeId: string;
  journeyId?: string;
  worldNodes: { id: string; label: string }[];
  canJourney: boolean;
  journeyBusy: boolean;
  onRecommend: (nodeId: string) => void;
  onDirection: (question: string) => void;
}

export function GuidePanel({ worldId, nodeId, journeyId, worldNodes, canJourney, journeyBusy,
  onRecommend, onDirection }: GuidePanelProps) {
  const [question, setQuestion] = useState("");
  const [targetNodeId, setTargetNodeId] = useState("");
  const [answer, setAnswer] = useState<{ value: GuideOutput; question: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  function invalidateAnswer() {
    active.current?.abort();
    active.current = null;
    setBusy(false); setError(""); setAnswer(undefined);
  }

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitted = question.trim() || (targetNodeId ? "为什么这两个节点连接？" : "");
    if (!submitted) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true); setError(""); setAnswer(undefined);
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch("/api/guide", { method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-Music-World": "1" },
        body: JSON.stringify({ worldId, nodeId, targetNodeId: targetNodeId || undefined, journeyId, question: submitted }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "暂时无法回答。");
      if (active.current === controller) setAnswer({ value: data as GuideOutput, question: submitted });
    } catch (cause) {
      if (active.current === controller) setError(controller.signal.aborted ? "Guide 暂时无响应，地图和 Journey 仍可继续使用。"
        : cause instanceof Error ? cause.message : "暂时无法回答，仍可继续探索。");
    } finally {
      clearTimeout(timer);
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  }

  const labels = new Map(worldNodes.map((node) => [node.id, node.label]));
  return <section className="guide-panel" aria-label="AI Guide 事实模式">
    <h3>AI Guide · 事实模式</h3>
    <p>根据已导入的标签和关系找方向；模型接口已预留。</p>
    <form onSubmit={(event) => void ask(event)}><label htmlFor="guide-target">比较的节点（选填）</label>
      <select id="guide-target" className="guide-node-select" value={targetNodeId} onChange={(event) => {
        invalidateAnswer(); setTargetNodeId(event.target.value);
      }}><option value="">只问当前节点</option>{worldNodes.filter((item) => item.id !== nodeId).map((item) =>
        <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      {targetNodeId && <p className="intent-hint">已选择两个节点：Guide 只解释它们之间保存的直接连接。探索方向请切回“只问当前节点”。</p>}
      <label htmlFor="guide-question">问问这个节点</label>
      <input id="guide-question" className="guide-question" value={question} onChange={(event) => {
        invalidateAnswer(); setQuestion(event.target.value);
      }}
        maxLength={240} placeholder="例如：为什么连接？更梦幻一点？" />
      <button type="submit" disabled={busy || (!question.trim() && !targetNodeId)}>{busy ? "正在查找依据…" : "查看已有依据"}</button></form>
    {error && <p role="alert">{error}</p>}
    {answer && <div className="guide-answer" role="status" aria-live="polite"><strong>基于已导入信息</strong><br />{answer.value.explanation}
      {answer.value.recommendedNodeIds.length > 0 && <div className="guide-recommendations"><strong>可继续探索</strong>
        {answer.value.recommendedNodeIds.map((id) => <button key={id} type="button" onClick={() => onRecommend(id)}>
          前往「{labels.get(id) ?? "关联节点"}」 ↗</button>)}</div>}
      {answer.value.directionSupported && canJourney && <button className="guide-direction" type="button" disabled={journeyBusy}
        onClick={() => onDirection(answer.question)}>{journeyBusy ? "正在生成路线…" : "沿这个方向生成 Journey →"}</button>}
      {answer.value.evidence.length > 0 && <details><summary>查看依据</summary><ul>{answer.value.evidence.map((item, index) =>
        <li key={`${index}:${item.reason}`}>{item.reason}</li>)}</ul></details>}
    </div>}
  </section>;
}
