import "server-only";

/**
 * 曲目 → 大众热度评分解析。
 *
 * 数据源：网易云音乐 `popularity`（0–100 整数），免密钥、大陆直连可达。
 * 该接口为非官方接口，因此本模块任何失败都只返回「未命中」，绝不向上抛错：
 * 调用方据此回落到前端既有的确定性派生评分。
 *
 * 实测注意：匿名搜索对多数曲库能返回原唱（陈奕迅、逃跑计划、Ed Sheeran 均命中），
 * 但个别歌手（如周杰伦）因版权下架搜不到原曲——这类曲目会正常回落派生评分。
 */

const SEARCH_ENDPOINT = "https://music.163.com/api/search/get/web";
const DETAIL_ENDPOINT = "https://music.163.com/api/song/detail";

// 缺少 Referer / UA / appver Cookie 会被上游拒绝。
const UPSTREAM_HEADERS = {
  Referer: "https://music.163.com/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Cookie: "appver=2.0.2; os=pc",
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** 上游是非官方接口，保守节流：所有出网请求串行且间隔 300ms。 */
const THROTTLE_MS = 300;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
/**
 * 候选窗口。实测取 5 时结果几乎全是翻唱，原唱挤不进前 5（如「孤勇者 陈奕迅」）；
 * 放宽到 20 后原唱稳定出现，同时响应体仍在 25KB 以内。
 */
const CANDIDATE_LIMIT = 20;
const DURATION_TOLERANCE_MS = 3000;
const MAX_BATCH_IDS = 50;

export interface RatingQuery {
  /** 调用方的曲目标识，原样回传。 */
  key: string;
  title: string;
  artist?: string;
  durationMs?: number;
}

export interface RatingHit {
  rating: number;
  source: "netease";
  neteaseId: number;
  confidence: "exact" | "fuzzy";
}

interface CacheEntry {
  /** null 表示「已确认上游无此曲」，同样需要缓存以免反复打空查询。 */
  hit: RatingHit | null;
  at: number;
}

const cache = new Map<string, CacheEntry>();

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown, max = 200): string =>
  typeof value === "string" || typeof value === "number" ? String(value).slice(0, max) : "";
const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * 标题 / 歌手比对用的归一化：全角转半角 → 去掉括号补充说明与 feat. 段 →
 * 小写 → 去掉空白与常见标点。两侧都归一化后再比，避免「晴天 (原唱 周杰伦)」这类噪声。
 */
function normalize(value: string): string {
  return value
    .replace(/[\uFF01-\uFF5E]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ")
    .replace(/[（(\[【][^）)\]】]*[）)\]】]/g, " ")
    .replace(/(feat\.?|ft\.?|featuring).*/i, " ")
    .toLowerCase()
    .replace(/[\s'’·,.!?—_:;/&"-]/g, "");
}

function cacheKeyOf(query: RatingQuery): string {
  const seconds = query.durationMs ? Math.round(query.durationMs / 1000) : 0;
  return `${normalize(query.title)}|${normalize(query.artist ?? "")}|${seconds}`;
}

/** 歌手匹配：完全一致 2 分，互相包含 1 分，完全无关 0 分。 */
function artistScore(names: string[], query: string): number {
  const target = normalize(query);
  if (!target) return 0;
  let best = 0;
  for (const name of names) {
    const value = normalize(name);
    if (!value) continue;
    if (value === target) best = Math.max(best, 2);
    else if (value.includes(target) || target.includes(value)) best = Math.max(best, 1);
  }
  return best;
}

let queue: Promise<void> = Promise.resolve();

function throttle(): Promise<void> {
  const next = queue.then(() => new Promise<void>((resolve) => setTimeout(resolve, THROTTLE_MS)));
  queue = next;
  return next;
}

/** 单个上游请求：任何异常（超时 / 非 2xx / 非法 JSON / 体积超限）都返回 null。 */
async function upstreamJson(url: URL, signal: AbortSignal): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, {
      headers: UPSTREAM_HEADERS,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    });
    if (!response.ok) return null;
    const body = new TextDecoder().decode(await response.arrayBuffer());
    if (body.length > MAX_BODY_BYTES) return null;
    return record(JSON.parse(body));
  } catch {
    return null;
  }
}

/** null 表示上游不可用（与「搜到 0 条」区分开，前者不能当作「确认无此曲」写缓存）。 */
async function searchCandidates(title: string, artist: string | undefined, signal: AbortSignal): Promise<unknown[] | null> {
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("s", [title, artist].filter(Boolean).join(" "));
  url.searchParams.set("type", "1");
  url.searchParams.set("limit", String(CANDIDATE_LIMIT));
  const payload = await upstreamJson(url, signal);
  if (!payload) return null;
  return list(record(payload.result).songs);
}

/** 解析一批曲目的网易云热度。返回 key → RatingHit；未命中的曲目不会出现在结果里。 */
export async function resolveTrackRatings(
  queries: readonly RatingQuery[],
  signal: AbortSignal,
): Promise<Map<string, RatingHit>> {
  const results = new Map<string, RatingHit>();
  const pending: RatingQuery[] = [];
  const now = Date.now();

  for (const query of queries) {
    const cached = cache.get(cacheKeyOf(query));
    if (cached && now - cached.at < CACHE_TTL_MS) {
      if (cached.hit) results.set(query.key, cached.hit);
      continue;
    }
    pending.push(query);
  }
  if (!pending.length) return results;

  const matched: { query: RatingQuery; neteaseId: number; confidence: "exact" | "fuzzy" }[] = [];

  for (const query of pending) {
    if (signal.aborted) break;
    const title = normalize(query.title);
    if (!title) {
      cache.set(cacheKeyOf(query), { hit: null, at: Date.now() });
      continue;
    }
    await throttle();
    const songs = await searchCandidates(query.title, query.artist, signal);
    // 上游不可用时无法确认「没有这首歌」，不写缓存，留待下次重试。
    if (songs === null) continue;
    let best: { id: number; confidence: "exact" | "fuzzy"; score: number; gap: number } | null = null;
    for (const value of songs) {
      const song = record(value);
      const id = finite(song.id);
      if (id === null || normalize(text(song.name)) !== title) continue;
      const names = list(song.artists).map((artist) => text(record(artist).name)).filter(Boolean);
      const score = artistScore(names, query.artist ?? "");
      // 有歌手信息时，歌手完全对不上的候选一律丢弃：搜索结果里混有大量同名翻唱。
      if (query.artist && score === 0) continue;
      const duration = finite(song.duration);
      const gap = query.durationMs && duration ? Math.abs(duration - query.durationMs) : Number.POSITIVE_INFINITY;
      if (query.durationMs && duration && gap > DURATION_TOLERANCE_MS) continue;
      if (!best || score > best.score || (score === best.score && gap < best.gap)) {
        best = { id, confidence: score >= 2 ? "exact" : "fuzzy", score, gap };
      }
    }
    if (best) matched.push({ query, neteaseId: best.id, confidence: best.confidence });
    else cache.set(cacheKeyOf(query), { hit: null, at: Date.now() });
  }

  if (!matched.length) return results;

  // 命中 id 去重后批量取热度：搜索接口本身不返回 popularity。
  const ids = [...new Set(matched.map((entry) => entry.neteaseId))];
  const popularity = new Map<number, number>();
  let detailUnavailable = false;
  for (let start = 0; start < ids.length; start += MAX_BATCH_IDS) {
    if (signal.aborted) return results;
    await throttle();
    const url = new URL(DETAIL_ENDPOINT);
    url.searchParams.set("ids", JSON.stringify(ids.slice(start, start + MAX_BATCH_IDS)));
    const payload = await upstreamJson(url, signal);
    if (!payload) {
      detailUnavailable = true;
      continue;
    }
    for (const value of list(payload.songs)) {
      const song = record(value);
      const id = finite(song.id);
      const pop = finite(song.popularity);
      if (id === null || pop === null) continue;
      popularity.set(id, Math.max(0, Math.min(100, Math.round(pop))));
    }
  }

  for (const entry of matched) {
    const rating = popularity.get(entry.neteaseId);
    if (rating === undefined) {
      // 拉取失败时不能断言「这首没有热度」，因此只在真正拿到响应后才缓存未命中。
      if (!detailUnavailable) cache.set(cacheKeyOf(entry.query), { hit: null, at: Date.now() });
      continue;
    }
    const hit: RatingHit = { rating, source: "netease", neteaseId: entry.neteaseId, confidence: entry.confidence };
    results.set(entry.query.key, hit);
    cache.set(cacheKeyOf(entry.query), { hit, at: Date.now() });
  }
  return results;
}
