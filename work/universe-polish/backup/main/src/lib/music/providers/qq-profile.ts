export interface QqUserProfile {
  id: string;
  nickname: string;
  avatar: string;
}

type Values = Record<string, unknown>;
const record = (value: unknown): Values => value && typeof value === "object" && !Array.isArray(value) ? value as Values : {};
const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";

export function qqCookieValues(header: string) {
  const values: Record<string, string> = {};
  for (const item of header.split(";")) {
    const separator = item.indexOf("=");
    if (separator > 0) values[item.slice(0, separator).trim()] = item.slice(separator + 1).trim();
  }
  return values;
}

export function qqMusicKey(header: string) {
  const values = qqCookieValues(header);
  return values.qm_keyst || values.qqmusic_key || values.music_key || "";
}

function nickname(value: unknown) {
  let result = text(value);
  try { if (/%[a-f\d]{2}/i.test(result)) result = decodeURIComponent(result); } catch { /* Keep unencoded platform text. */ }
  return result.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80);
}

function avatar(value: unknown) {
  try {
    const source = text(value);
    if (!source) return "";
    const url = new URL(source.startsWith("//") ? "https:" + source : source);
    if (url.protocol === "http:") url.protocol = "https:";
    if (url.protocol !== "https:" || url.username || url.password || url.port) return "";
    if (!["qq.com", "qlogo.cn", "gtimg.cn", "qpic.cn"].some(domain => url.hostname === domain || url.hostname.endsWith("." + domain))) return "";
    return url.href.slice(0, 2048);
  } catch { return ""; }
}

/** Profile values are public display data; platform credentials never enter this type. */
export function normalizeQqProfile(payload: unknown, fallback: QqUserProfile): QqUserProfile {
  const root = record(payload);
  const data = record(root.data ?? root.profile ?? root.result ?? root);
  const creator = record(data.creator ?? data.user ?? data.profile ?? data);
  return {
    // The authenticated account is authoritative; a profile cannot switch its identity.
    id: fallback.id,
    nickname: nickname(creator.nick ?? creator.nickname ?? creator.name) || nickname(fallback.nickname) || "QQ 音乐用户",
    avatar: avatar(creator.headpic ?? creator.avatar ?? creator.avatarUrl ?? creator.logo) || avatar(fallback.avatar),
  };
}

/** Parse the upstream callback as data, without evaluating its JavaScript. */
export function parseQqLoginCallback(body: string) {
  if (!/^\s*ptuiCB\(/.test(body)) return null;
  const values = [...body.matchAll(/'((?:\\.|[^'\\])*)'/g)].map(match => match[1].replace(/\\(?:u([\da-f]{4})|x([\da-f]{2})|([\\'"nr]))/gi, (_, unicode, hex, escaped) => {
    if (unicode || hex) return String.fromCharCode(parseInt(unicode || hex, 16));
    return escaped === "n" ? "\n" : escaped === "r" ? "\r" : escaped;
  }));
  if (values.length < 5 || !/^\d+$/.test(values[0])) return null;
  return { code: values[0], callbackUrl: values[2], message: values[4], nickname: nickname(values[5]) };
}

export function trustedQqLoginUrl(value: string, base?: string) {
  try {
    const url = new URL(value, base);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !(url.hostname === "qq.com" || url.hostname.endsWith(".qq.com"))) return null;
    return url;
  } catch { return null; }
}
