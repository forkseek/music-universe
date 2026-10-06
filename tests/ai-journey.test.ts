import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, type DatabaseContext } from "@/db/connection";
import { createSession } from "@/lib/server/session";
import { saveFileImport, readLibrary } from "@/lib/music/library";
import { createWorld } from "@/lib/music/worlds";
import { createGuidedJourney, readJourney } from "@/lib/music/journeys";
import { answerGuide, buildGuideModelInput } from "@/lib/ai/guide";
import { validateGuideRecommendations } from "@/lib/ai/guide-contract";
import { buildGuidePrompt } from "@/lib/ai/guide-prompt";
import { buildAIJourneyInput, requestAIJourney } from "@/lib/ai/journey";
import { createOpenAICompatibleProvider } from "@/lib/ai/client";
import type { AIJourneyInput, AIProvider } from "@/lib/ai/contract";

const folders: string[] = [];
const contexts: DatabaseContext[] = [];
function fixture() {
  const folder = mkdtempSync(path.join(tmpdir(), "music-world-ai-")); folders.push(folder);
  const context = openDatabase(path.join(folder, "music.db")); contexts.push(context);
  const { userId } = createSession(context);
  const rows = [
    { title: "Anchor", artist: "Start", genre: "rock" },
    { title: "Alpha", artist: "A", genre: "rock" },
    { title: "Beta", artist: "B", genre: "rock" },
    { title: "Dream One", artist: "C", genre: "dream pop" },
    { title: "Dream Two", artist: "D", genre: "shoegaze" },
    { title: "Gamma", artist: "E", genre: "ambient" },
  ];
  saveFileImport(userId, [{ name: "tracks.json", bytes: new TextEncoder().encode(JSON.stringify(rows)) }], "library", context);
  const world = createWorld(userId, "AI Test", "library", context).world;
  const start = world.nodes.find((node) => node.type === "track" && node.label === "Anchor")!;
  const library = readLibrary(userId, "library", context);
  const input = buildAIJourneyInput(world, library.tracks, start.trackId!, "更梦幻一点");
  return { context, userId, world, start, library, input };
}
afterEach(() => {
  for (const context of contexts.splice(0)) if (context.sqlite.open) context.sqlite.close();
  for (const folder of folders.splice(0)) {
    const target = path.resolve(folder);
    if (path.dirname(target) !== path.resolve(tmpdir()) || !path.basename(target).startsWith("music-world-ai-")) throw new Error("Unsafe cleanup path");
    rmSync(target, { recursive: true, force: true });
  }
});

function validOutput(input: AIJourneyInput) {
  return JSON.stringify({ summary: "依据候选歌曲调整方向", stops: input.candidates.slice(0, input.length)
    .map((track, index) => ({ trackId: track.id, reason: index ? "使用已提供的歌曲标签推荐。" : "从当前歌曲出发。" })) });
}

describe("AI Journey contract and fallback", () => {
  it("sends bounded real candidates, intent and saved relation evidence without raw source metadata", () => {
    const { world, input, library } = fixture();
    expect(input.intent).toBe("更梦幻一点");
    expect(input.candidates[0].id).toBe(input.startTrackId);
    expect(input.candidates.length).toBeLessThanOrEqual(40);
    expect(input.candidates.some((track) => track.genres.includes("dream pop"))).toBe(true);
    const ids = new Set(library.tracks.map((track) => track.id));
    expect(input.candidates.every((track) => ids.has(track.id) && !("sources" in track))).toBe(true);
    expect(input.relations.every((relation) => relation.trackIds.every((id) => ids.has(id)))).toBe(true);
    expect(input.worldId).toBe(world.id);
  });

  it("retries invalid JSON once and accepts a corrected, grounded response", async () => {
    const { input } = fixture();
    const generateJourney = vi.fn().mockResolvedValueOnce("{broken").mockResolvedValueOnce(validOutput(input));
    const result = await requestAIJourney(input, { generateJourney });
    expect(generateJourney).toHaveBeenCalledTimes(2);
    expect(result?.stops).toHaveLength(5);
  });

  it.each(["invalid_json", "unknown_track", "duplicate_track", "wrong_start", "wrong_length", "invalid_schema"] as const)
  ("rejects %s twice and returns control to the fallback", async (kind) => {
    const { input } = fixture();
    const data = JSON.parse(validOutput(input)) as { summary: string; stops: { trackId: string; reason: string }[] };
    if (kind === "unknown_track") data.stops[1].trackId = crypto.randomUUID();
    if (kind === "duplicate_track") data.stops[1].trackId = data.stops[0].trackId;
    if (kind === "wrong_start") [data.stops[0], data.stops[1]] = [data.stops[1], data.stops[0]];
    if (kind === "wrong_length") data.stops.pop();
    if (kind === "invalid_schema") data.stops[1].reason = "";
    const generateJourney = vi.fn().mockResolvedValue(kind === "invalid_json" ? "{broken" : JSON.stringify(data));
    expect(await requestAIJourney(input, { generateJourney })).toBeUndefined();
    expect(generateJourney).toHaveBeenCalledTimes(2);
  });

  it("returns immediately after disconnect and after a bounded timeout", async () => {
    const { input } = fixture();
    const broken = vi.fn().mockRejectedValue(new Error("connection reset"));
    expect(await requestAIJourney(input, { generateJourney: broken })).toBeUndefined();
    expect(broken).toHaveBeenCalledTimes(1);
    let signal: AbortSignal | undefined;
    const waiting: AIProvider = { generateJourney: async (_, nextSignal) => { signal = nextSignal; return new Promise<string>(() => {}); } };
    expect(await requestAIJourney(input, waiting, 15)).toBeUndefined();
    expect(signal?.aborted).toBe(true);
  });

  it("uses the server-only compatible adapter's configured URL and structured prompt", async () => {
    const { input } = fixture();
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: validOutput(input) } }] }), { status: 200 })) as unknown as typeof fetch;
    const provider = createOpenAICompatibleProvider({ provider: "openai-compatible", baseUrl: "https://model.example/v1", model: "test-model", apiKey: "test-secret" }, fetchImpl);
    expect(await requestAIJourney(input, provider)).toBeDefined();
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(url).toBe("https://model.example/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-secret");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("test-model");
    expect(body.messages[1].content).toContain("更梦幻一点");
  });

  it("saves an intent-adjusted valid route with no key, then accepts a validated model route", async () => {
    const { context, userId, world, start } = fixture();
    const baseline = await createGuidedJourney(userId, world.id, start.id, "往摇滚方向走", context, undefined, { provider: null });
    const dreamy = await createGuidedJourney(userId, world.id, start.id, "更梦幻一点", context, undefined, { provider: null });
    expect(dreamy.mode).toBe("deterministic");
    expect(dreamy.intent).toBe("更梦幻一点");
    expect(dreamy.nodes).toHaveLength(5);
    expect(dreamy.nodes.map((node) => node.trackId)).not.toEqual(baseline.nodes.map((node) => node.trackId));
    expect(dreamy.nodes.some((node) => node.reason.includes("已导入流派标签"))).toBe(true);
    const generateJourney = vi.fn(async (input: AIJourneyInput) => {
      const [first, ...rest] = input.candidates.slice(0, input.length);
      return JSON.stringify({ summary: "模型测试路线", stops: [first, ...rest.reverse()].map((track) => ({ trackId: track.id, reason: "从真实候选中选择。" })) });
    });
    const fromModel = await createGuidedJourney(userId, world.id, start.id, "更梦幻一点", context, undefined, { provider: { generateJourney } });
    expect(fromModel.mode).toBe("ai");
    expect(fromModel.nodes[0].trackId).toBe(dreamy.nodes[0].trackId);
    expect(new Set(fromModel.nodes.map((node) => node.trackId)).size).toBe(5);
    expect(readJourney(userId, fromModel.id, context)).toEqual(fromModel);
  });

  it("keeps exploration and Guide facts available when both model attempts fail", async () => {
    const { context, userId, world, start } = fixture();
    const invalid = vi.fn().mockResolvedValue("{broken");
    const journey = await createGuidedJourney(userId, world.id, start.id, "更梦幻一点", context, undefined, { provider: { generateJourney: invalid } });
    expect(invalid).toHaveBeenCalledTimes(2);
    expect(journey.mode).toBe("deterministic");
    expect(journey.nodes).toHaveLength(5);
    const guide = answerGuide(userId, { worldId: world.id, nodeId: start.id, question: "为什么这个节点在这里？" }, context);
    expect(guide.mode).toBe("facts");
    expect(guide.explanation).toContain("Anchor");
    const guideInput = buildGuideModelInput(userId, { worldId: world.id, nodeId: start.id, question: "为什么？" }, context);
    expect(guideInput.currentNode.relatedTracks[0].title).toBe("Anchor");
    expect(guideInput.currentJourney?.id).toBe(journey.id);
    expect(guideInput.userProfile.importedGenres.length).toBeGreaterThan(0);
    expect(guide.recommendedNodeIds.every((id) => world.nodes.some((node) => node.id === id))).toBe(true);
    const outsider = createSession(context);
    expect(() => answerGuide(outsider.userId, { worldId: world.id, nodeId: start.id, question: "为什么？" }, context)).toThrow("未找到");
  });

  it("grounds Guide directions in imported genres and rejects invented or repeated nodes", async () => {
    const { context, userId, world, start, library } = fixture();
    const previous = await createGuidedJourney(userId, world.id, start.id, "往摇滚方向走", context, undefined, { provider: null });
    await createGuidedJourney(userId, world.id, start.id, "更梦幻一点", context, undefined, { provider: null });
    const request = { worldId: world.id, nodeId: start.id, journeyId: previous.id, question: "更梦幻一点" };
    expect(buildGuideModelInput(userId, request, context).currentJourney?.id).toBe(previous.id);
    const prompt = buildGuidePrompt(buildGuideModelInput(userId, request, context));
    expect(prompt.user).toContain(previous.id);
    expect(prompt.system).toContain("recommendedNodeIds");
    const answer = answerGuide(userId, request, context);
    expect(answer.mode).toBe("facts");
    expect(answer.intent).toBe("dreamier");
    expect(answer.directionSupported).toBe(true);
    expect(answer.recommendedNodeIds.length).toBeGreaterThan(0);
    expect(answer.recommendedNodeIds.every((id) => {
      const node = world.nodes.find((item) => item.id === id);
      return !!node && node.metadata.trackIds.some((trackId) => library.tracks.find((track) => track.id === trackId)?.genre
        ?.some((genre) => ["dream pop", "shoegaze", "ambient"].includes(genre)));
    })).toBe(true);
    const valid = { intent: answer.intent, recommendedNodeIds: answer.recommendedNodeIds, explanation: answer.explanation };
    expect(validateGuideRecommendations(valid, world.nodes.map((node) => node.id))).toEqual(valid);
    expect(() => validateGuideRecommendations({ ...valid, recommendedNodeIds: [crypto.randomUUID()] }, world.nodes.map((node) => node.id))).toThrow();
    expect(() => validateGuideRecommendations({ ...valid, recommendedNodeIds: [start.id, start.id] }, world.nodes.map((node) => node.id))).toThrow();
    const quiet = answerGuide(userId, { worldId: world.id, nodeId: start.id, question: "不要太吵" }, context);
    expect(quiet.directionSupported).toBe(false);
    expect(quiet.recommendedNodeIds).toEqual([]);
    expect(quiet.explanation).toContain("响度");
    const otherWorld = createWorld(userId, "Other World", "library", context).world;
    expect(() => buildGuideModelInput(userId, { ...request, worldId: otherWorld.id, nodeId: otherWorld.nodes[0].id }, context)).toThrow("未找到");
  });

  it("explains only the selected pair's saved edge and reports missing direct edges honestly", () => {
    const { context, userId, world } = fixture();
    const edge = world.edges[0];
    expect(edge).toBeDefined();
    const linked = { worldId: world.id, nodeId: edge.source, targetNodeId: edge.target, question: "为什么这两个节点连接？" };
    const facts = buildGuideModelInput(userId, linked, context);
    expect(facts.comparisonNode?.id).toBe(edge.target);
    expect(facts.comparisonNode?.connections.map((connection) => connection.reason)).toContain(edge.reason);
    expect(buildGuidePrompt(facts).user).toContain(edge.reason);
    const answer = answerGuide(userId, linked, context);
    expect(answer.explanation).toContain(edge.reason);
    expect(answer.evidence.map((item) => item.reason)).toContain(edge.reason);
    expect(answer.recommendedNodeIds).toEqual([]);
    expect(answer.directionSupported).toBe(false);

    const connectedPairs = new Set(world.edges.map((item) => [item.source, item.target].sort().join(":")));
    const disconnected = world.nodes.flatMap((source) => world.nodes.filter((target) =>
      target.id !== source.id && !connectedPairs.has([source.id, target.id].sort().join(":")))
      .map((target) => [source.id, target.id] as const))[0];
    expect(disconnected).toBeDefined();
    const noEdge = answerGuide(userId, { ...linked, nodeId: disconnected[0], targetNodeId: disconnected[1] }, context);
    expect(noEdge.explanation).toContain("没有已保存的直接连接");
    expect(noEdge.evidence).toEqual([]);
    expect(() => answerGuide(userId, { ...linked, targetNodeId: edge.source }, context)).toThrow("另一个节点");
    const otherWorld = createWorld(userId, "Other World", "library", context).world;
    expect(() => answerGuide(userId, { ...linked, targetNodeId: otherWorld.nodes[0].id }, context)).toThrow("没有要比较的节点");
  });

  it("persists valid fallback Journeys after model disconnect and timeout", async () => {
    const { context, userId, world, start } = fixture();
    const disconnected = await createGuidedJourney(userId, world.id, start.id, "更梦幻一点", context, undefined,
      { provider: { generateJourney: async () => { throw new Error("connection reset"); } } });
    const timedOut = await createGuidedJourney(userId, world.id, start.id, "更梦幻一点", context, undefined,
      { provider: { generateJourney: async () => new Promise<string>(() => {}) }, timeoutMs: 15 });
    for (const journey of [disconnected, timedOut]) {
      expect(journey.mode).toBe("deterministic");
      expect(journey.nodes).toHaveLength(5);
      expect(new Set(journey.nodes.map((node) => node.trackId)).size).toBe(5);
      expect(readJourney(userId, journey.id, context)).toEqual(journey);
    }
  });
});
