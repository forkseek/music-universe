import { createRequire } from "node:module";
import { Agent } from "node:https";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createNeteaseNetwork } = require("../integrations/mineradio/netease-network.cjs");
const sdkRequire = createRequire(require.resolve("NeteaseCloudMusicApi/package.json"));
const axios = sdkRequire("axios");

describe("isolated NetEase connection adapter", () => {
  it("reuses transport agents on official hosts and enforces a bounded upstream deadline", async () => {
    const client = axios.create(), network = createNeteaseNetwork(client);
    const configs: { httpAgent: unknown; httpsAgent: unknown; timeout: number }[] = [];
    client.defaults.adapter = async (config: typeof configs[number]) => { configs.push(config); return { data: {}, status: 200, statusText: "OK", headers: {}, config }; };
    try {
      await network.run(new AbortController().signal, () => client.post("https://music.163.com/api/fixture", {}, { proxy: false }));
      await network.run(new AbortController().signal, () => client.post("https://interface.music.163.com/eapi/fixture", {}, { proxy: false }));
      expect(configs[0].httpsAgent).toBe(configs[1].httpsAgent);
      expect(configs[0].httpAgent).toBe(configs[1].httpAgent);
      expect(configs[0].timeout).toBe(12000);
    } finally { network.close(); }
  });
  it("cancels only the superseded caller while concurrent users retain their own signals", async () => {
    const client = axios.create(), network = createNeteaseNetwork(client);
    const signals: AbortSignal[] = [];
    client.defaults.adapter = async (config: { signal: AbortSignal }) => {
      signals.push(config.signal);
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    };
    const first = new AbortController(), second = new AbortController();
    try {
      await Promise.all([network.run(first.signal, () => client.post("https://music.163.com/api/fixture", {})),
        network.run(second.signal, () => client.post("https://music.163.com/api/fixture", {}))]);
      first.abort();
      expect(signals[0].aborted).toBe(true); expect(signals[1].aborted).toBe(false);
      await expect(network.run(first.signal, () => client.post("https://music.163.com/api/fixture", {}))).rejects.toMatchObject({ code: "ERR_CANCELED" });
    } finally { network.close(); }
  });
  it("preserves configured proxies and leaves unrelated platform requests unchanged", async () => {
    const client = axios.create(), network = createNeteaseNetwork(client);
    const configs: { httpsAgent: unknown; timeout: number; signal?: AbortSignal }[] = [];
    client.defaults.adapter = async (config: typeof configs[number]) => { configs.push(config); return { data: {}, status: 200, statusText: "OK", headers: {}, config }; };
    const proxyAgent = new Agent();
    try {
      await network.run(new AbortController().signal, () => client.get("https://music.163.com/api/fixture", { httpsAgent: proxyAgent }));
      await network.run(new AbortController().signal, () => client.get("https://example.com/fixture", { timeout: 900 }));
      expect(configs[0].httpsAgent).toBe(proxyAgent);
      expect(configs[1].timeout).toBe(900); expect(configs[1].signal).toBeUndefined();
    } finally { network.close(); proxyAgent.destroy(); }
  });
});
