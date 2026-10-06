import { describe, expect, it } from "vitest";
import { getProvider, listProviderStatuses } from "@/lib/music/providers/registry";
import { qqMusicAvailability, detectQQMusicBrowserAvailability } from "@/lib/music/providers/qqmusic";

describe("Provider registry and truthful availability", () => {
  it("registers five named platforms while only file and verified demo claim direct availability", async () => {
    const providers = await listProviderStatuses();
    expect(providers.map((p) => p.id)).toEqual(["file", "qqmusic", "netease", "kugou", "qishui", "spotify", "demo"]);
    expect(providers.filter((p) => p.available).map((p) => p.id)).toEqual(["file", "demo"]);
    expect(getProvider("file").getCapabilities().fileImport).toBe(true);
    expect(getProvider("qqmusic").getCapabilities().fileImport).toBe(true);
    expect(getProvider("netease").getCapabilities().auth).toBe(false);
    for (const id of ["netease", "kugou", "qishui", "spotify"] as const) {
      expect(getProvider(id).getCapabilities()).toMatchObject({ auth: false, fileImport: true });
      expect(await getProvider(id).getAvailability()).toMatchObject({ available: false, reason: "OFFICIAL_INTEGRATION_PENDING" });
    }
  });
  it("never equates SDK presence or feature configuration to authentication", () => {
    expect(qqMusicAvailability(false)).toMatchObject({ available: false, reason: "FEATURE_DISABLED" });
    expect(qqMusicAvailability(true)).toMatchObject({ available: false, reason: "CLIENT_ENVIRONMENT_REQUIRED" });
    expect(qqMusicAvailability(true, { sdkPresent: false })).toMatchObject({ available: false, reason: "OFFICIAL_SDK_NOT_AVAILABLE" });
    expect(qqMusicAvailability(true, { sdkPresent: true })).toMatchObject({ available: false, reason: "OFFICIAL_INTEGRATION_PENDING" });
    expect(() => detectQQMusicBrowserAvailability()).not.toThrow();
  });
});
