import "server-only";
import { getDatabase } from "@/db/connection";
import { readLibrary } from "@/lib/music/library";
import { readWorld } from "@/lib/music/worlds";
import { listJourneys, readJourney } from "@/lib/music/journeys";
import { deriveTrackSignal } from "@/lib/music/signals";
import { explicitGenreHints, matchedIntentGenre } from "@/lib/music/journey/intent";
import { RequestError } from "@/lib/server/errors";
import { guideModelInputSchema, guideOutputSchema, validateGuideRecommendations, type GuideInput, type GuideModelInput, type GuideOutput } from "./guide-contract";

export function buildGuideModelInput(userId: string, input: GuideInput, context = getDatabase()): GuideModelInput {
  const world = readWorld(userId, input.worldId, context);
  const library = readLibrary(userId, world.scope, context);
  const routeTrackId = input.nodeId.startsWith("route:") ? input.nodeId.slice(6) : undefined;
  const routeTrack = routeTrackId ? library.tracks.find((track) => track.id === routeTrackId) : undefined;
  const node = world.nodes.find((item) => item.id === input.nodeId)
    ?? (routeTrack ? { id: input.nodeId, label: routeTrack.title, metadata: { trackIds: [routeTrack.id], basis: "已保存路线中的真实歌曲" } } : undefined);
  if (!node) throw new RequestError(404, "当前音乐世界没有这个节点。", "NOT_FOUND");
  const comparisonNode = input.targetNodeId ? world.nodes.find((item) => item.id === input.targetNodeId) : undefined;
  if (input.targetNodeId && !comparisonNode) throw new RequestError(404, "当前音乐世界没有要比较的节点。", "NOT_FOUND");
  if (comparisonNode?.id === node.id) throw new RequestError(400, "请选择另一个节点进行比较。", "INVALID_GUIDE_INPUT");
  const connections = comparisonNode ? world.edges.filter((edge) =>
    (edge.source === node.id && edge.target === comparisonNode.id)
    || (edge.target === node.id && edge.source === comparisonNode.id)) : [];
  const related = library.tracks.filter((track) => node.metadata.trackIds.includes(track.id));
  const nodes = new Map(world.nodes.map((item) => [item.id, item]));
  const nearby = world.edges.filter((edge) => edge.source === node.id || edge.target === node.id).slice(0, 12)
    .map((edge) => ({ id: edge.source === node.id ? edge.target : edge.source, label: nodes.get(edge.source === node.id ? edge.target : edge.source)?.label ?? "",
      relation: edge.relation, reason: edge.reason.slice(0, 300), trackIds: edge.evidence.trackIds.slice(0, 40) }));
  const genres = new Map<string, number>();
  for (const track of library.tracks) for (const genre of track.genre ?? []) genres.set(genre, (genres.get(genre) ?? 0) + 1);
  const latest = input.journeyId ? undefined : listJourneys(userId, world.id, context)[0];
  const currentJourney = input.journeyId || latest ? readJourney(userId, input.journeyId ?? latest!.id, context) : undefined;
  if (currentJourney && currentJourney.worldId !== world.id) throw new RequestError(404, "未找到这条旅行路线。", "NOT_FOUND");
  return guideModelInputSchema.parse({ schemaVersion: 1, worldId: world.id, question: input.question,
    currentNode: { id: node.id, label: node.label.slice(0, 200), basis: node.metadata.basis.slice(0, 300),
      relatedTracks: related.slice(0, 20).map((track) => ({ id: track.id, title: track.title.slice(0, 200),
        artists: track.artists.slice(0, 10).map((artist) => artist.name.slice(0, 120)) })) },
    userProfile: { likedTrackIds: library.tracks.filter((track) => deriveTrackSignal(track).liked === true).map((track) => track.id).slice(0, 40),
      recentlyPlayedTrackIds: library.tracks.filter((track) => deriveTrackSignal(track).recentlyPlayed === true).map((track) => track.id).slice(0, 40),
      importedGenres: [...genres].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 20)
        .map(([name, trackCount]) => ({ name: name.slice(0, 80), trackCount })) },
    nearbyNodes: nearby,
    comparisonNode: comparisonNode ? { id: comparisonNode.id, label: comparisonNode.label.slice(0, 200),
      basis: comparisonNode.metadata.basis.slice(0, 300),
      connections: connections.slice(0, 4).map((edge) => ({ relation: edge.relation,
        reason: edge.reason.slice(0, 300), trackIds: edge.evidence.trackIds.slice(0, 40) })) } : undefined,
    currentJourney: currentJourney ? { id: currentJourney.id, trackIds: currentJourney.nodes.map((stop) => stop.trackId) } : undefined });
}

/** Fact-only Guide: recommend saved nodes using explicit imported tags, without inferring audio properties. */
export function answerGuide(userId: string, input: GuideInput, context = getDatabase()): GuideOutput {
  const facts = buildGuideModelInput(userId, input, context);
  const world = readWorld(userId, input.worldId, context);
  const library = readLibrary(userId, world.scope, context);
  const node = facts.currentNode;
  const nearby = facts.nearbyNodes;
  const comparison = facts.comparisonNode;
  if (comparison) {
    const explanation = comparison.connections.length
      ? `「${node.label}」与「${comparison.label}」在当前世界有已保存的直接连接：${comparison.connections.map((edge) => edge.reason).join("；")}。`
      : `「${node.label}」与「${comparison.label}」在当前世界没有已保存的直接连接。地图数据不足以解释这两个节点之间的直接关系。`;
    return guideOutputSchema.parse({ mode: "facts", directionSupported: false, intent: null,
      recommendedNodeIds: [], explanation: explanation.slice(0, 1200),
      evidence: comparison.connections.map((edge) => ({ reason: edge.reason, trackIds: edge.trackIds })) });
  }
  const question = input.question;
  const hints = explicitGenreHints(question);
  const intent = /梦幻|梦境|dreamy|dreamlike/iu.test(question) ? "dreamier"
    : /摇滚|\brock\b/iu.test(question) ? "rockier"
      : /电子|\belectronic\b/iu.test(question) ? "electronic" : null;
  const wantsWhy = /为什么|依据|关系|why|reason/iu.test(input.question);
  const wantsSongs = /哪些|歌曲|曲目|tracks|songs/iu.test(input.question);
  const wantsQuiet = /不要太吵|安静|轻柔|quiet|soft|loud/iu.test(question);
  const direct = new Set(nearby.map((item) => item.id));
  const matches = new Map(library.tracks.filter((track) => matchedIntentGenre(track, hints)).map((track) => [track.id, track]));
  const ranked = hints.length ? world.nodes.filter((item) => item.id !== node.id)
    .map((item) => ({ item, trackIds: item.metadata.trackIds.filter((id) => matches.has(id)) }))
    .filter((item) => item.trackIds.length)
    .sort((a, b) => Number(direct.has(b.item.id)) - Number(direct.has(a.item.id))
      || b.trackIds.length - a.trackIds.length || Number(b.item.type === "track") - Number(a.item.type === "track")
      || b.item.weight - a.item.weight || a.item.label.localeCompare(b.item.label)) : [];
  const selected: typeof ranked = [];
  const covered = new Set<string>();
  for (const candidate of ranked) {
    if (candidate.trackIds.every((id) => covered.has(id))) continue;
    selected.push(candidate);
    for (const id of candidate.trackIds) covered.add(id);
    if (selected.length === 5) break;
  }
  const recommendedNodeIds = hints.length ? selected.map((item) => item.item.id)
    : wantsQuiet ? [] : [...new Set(nearby.map((item) => item.id))].slice(0, 5);
  const explanation = wantsQuiet
    ? `「${node.label}」附近没有导入的响度或音频分析数据，暂时无法可靠判断哪些歌曲“不太吵”。你仍可查看已保存的关系或自行选择方向。`
    : hints.length
      ? matches.size ? `根据已导入的流派标签，库中有 ${matches.size} 首歌曲与这个方向匹配。${selected.length
        ? `可先看看 ${selected.slice(0, 3).map(({ item }) => `「${item.label}」`).join("、")}；也可从当前节点生成新路线。`
        : "主要地图中没有其他匹配节点；仍可从当前节点生成新路线。"}这只是标签匹配，不代表听感分析。`
        : "已识别这个探索方向，但当前音乐库没有对应的已导入流派标签，无法据此可靠调整推荐。"
      : wantsWhy && nearby.length
        ? `「${node.label}」的依据：${node.basis}。已记录的连接包括：${nearby.slice(0, 2).map((item) => item.reason).join("；")}。`
        : wantsSongs && node.relatedTracks.length
          ? `「${node.label}」关联的已导入歌曲包括：${node.relatedTracks.slice(0, 5).map((track) => track.title).join("、")}。`
          : `「${node.label}」的依据：${node.basis}。${nearby.length ? `已记录 ${nearby.length} 条直接连接。` : "当前没有可证明的直接连接。"}`;
  const evidence = hints.length ? selected.slice(0, 4).map(({ item, trackIds }) => ({
    reason: `「${item.label}」关联的歌曲带有已导入流派标签：${[...new Set(trackIds.map((id) => matchedIntentGenre(matches.get(id)!, hints)))].join("、")}`,
    trackIds,
  })) : wantsQuiet ? [] : nearby.slice(0, 4).map((item) => ({ reason: item.reason, trackIds: item.trackIds }));
  const recommendation = validateGuideRecommendations({ intent, recommendedNodeIds, explanation: explanation.slice(0, 1200) }, world.nodes.map((item) => item.id));
  return guideOutputSchema.parse({ mode: "facts", directionSupported: hints.length > 0 && matches.size > 0,
    ...recommendation, evidence });
}
