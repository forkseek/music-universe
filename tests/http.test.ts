import { afterEach, describe, expect, it } from "vitest";
import { readBoundedBody, readJson, requireSameOrigin } from "@/lib/server/http";

const previousOrigin = process.env.APP_ORIGIN;
afterEach(() => {
  if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = previousOrigin;
});

describe("bounded request bodies", () => {
  it("rejects a claimed oversized body before reading it", async () => {
    const input = new Request("http://localhost/api/example", { method: "POST", headers: { "content-length": "1000" }, body: "{}" });
    await expect(readBoundedBody(input, 100)).rejects.toMatchObject({ status: 413, code: "BODY_TOO_LARGE" });
  });
  it("bounds streamed bodies even without a Content-Length header", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(65)); },
      cancel() { cancelled = true; },
    });
    const options: RequestInit & { duplex: "half" } = { method: "POST", body, duplex: "half" };
    await expect(readBoundedBody(new Request("http://localhost/api/example", options), 64)).rejects.toMatchObject({ status: 413 });
    expect(cancelled).toBe(true);
  });
  it("returns a generic validation error for malformed JSON and invalid UTF-8", async () => {
    for (const body of ["{", new Uint8Array([0xc3, 0x28])]) {
      await expect(readJson(new Request("http://localhost/api/example", { method: "POST", body }))).rejects.toMatchObject({ status: 400, code: "INVALID_JSON" });
    }
  });
  it("accepts valid JSON at the byte limit", async () => {
    expect(await readJson(new Request("http://localhost/api/example", { method: "POST", body: "{}" }), 2)).toEqual({});
  });
});

function request(origin: string, host = "127.0.0.1:3000", site = "same-origin") {
  return new Request("http://localhost:3000/api/worlds", { method: "POST", headers: {
    host, origin, "x-music-world": "1", "sec-fetch-site": site,
  } });
}

describe("write origin boundary", () => {
  it("accepts the actual Host when standalone Next reports localhost internally", () => {
    delete process.env.APP_ORIGIN;
    expect(() => requireSameOrigin(request("http://127.0.0.1:3000"))).not.toThrow();
    expect(() => requireSameOrigin(request("http://localhost:3000"))).toThrow();
  });
  it("uses configured public origin behind a proxy and still rejects cross-site requests", () => {
    process.env.APP_ORIGIN = "https://music.example.com";
    expect(() => requireSameOrigin(request("https://music.example.com", "internal:3000"))).not.toThrow();
    expect(() => requireSameOrigin(request("http://127.0.0.1:3000"))).toThrow();
    expect(() => requireSameOrigin(request("https://music.example.com", "internal:3000", "cross-site"))).toThrow();
  });
});
