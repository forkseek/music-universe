import "server-only";
import { RequestError } from "@/lib/server/errors";

/** Keep each serverless response below the host's 20 MB streaming limit. */
export function audioResponseLimits() {
  const configured = Number(process.env.MUSIC_AUDIO_RESPONSE_BYTES);
  const enabled = Number.isSafeInteger(configured) && configured >= 256 * 1024 && configured <= 18 * 1024 * 1024;
  return { enabled, rangeBytes: enabled ? configured : 48 * 1024 * 1024, responseBytes: enabled ? 18 * 1024 * 1024 : 48 * 1024 * 1024 };
}

/** A shorter valid range lets the native audio element continue with its next request. */
export function boundedAudioRange(range: string | null) {
  if (!range) return null;
  const parts = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!parts || (!parts[1] && !parts[2])) throw new RequestError(416, "音频范围无效。", "INVALID_AUDIO_RANGE");
  const { rangeBytes, enabled } = audioResponseLimits();
  if (!parts[1]) {
    const suffix = Number(parts[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new RequestError(416, "音频范围无效。", "INVALID_AUDIO_RANGE");
    return enabled ? "bytes=-" + Math.min(suffix, rangeBytes) : range;
  }
  const start = Number(parts[1]), requestedEnd = parts[2] ? Number(parts[2]) : Infinity;
  if (!Number.isSafeInteger(start) || start < 0 || (parts[2] && (!Number.isSafeInteger(requestedEnd) || requestedEnd < start)) || !Number.isSafeInteger(start + rangeBytes - 1))
    throw new RequestError(416, "音频范围无效。", "INVALID_AUDIO_RANGE");
  return enabled ? `bytes=${start}-${Math.min(requestedEnd, start + rangeBytes - 1)}` : range;
}

export function audioTooLarge() {
  return new RequestError(413, "这首歌曲的音频过大，暂时无法读取，请重试或更换歌曲。", "AUDIO_RESPONSE_TOO_LARGE");
}

export async function boundedAudioBody(response: Response, defaultLimit = 48 * 1024 * 1024) {
  const limits = audioResponseLimits(), limit = limits.enabled ? limits.responseBytes : defaultLimit;
  const size = Number(response.headers.get("content-length"));
  if (size > limit) { await response.body?.cancel(); throw audioTooLarge(); }
  if (!response.body) throw new RequestError(502, "音频暂时无法读取。", "AUDIO_UNAVAILABLE");
  if (!response.headers.has("content-length")) {
    // Validate an unknown-size response before sending any audio, rather than truncating a song.
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        total += part.value.length;
        if (total > limit) { await reader.cancel(); throw audioTooLarge(); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    return new Uint8Array(Buffer.concat(chunks));
  }
  let total = 0;
  return response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
    total += chunk.length;
    if (total > limit) { controller.error(audioTooLarge()); return; }
    controller.enqueue(chunk);
  } }));
}
