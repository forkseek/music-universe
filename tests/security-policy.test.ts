import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, frameAncestorSources, universeContentSecurityPolicy } from "@/lib/server/security-policy";
import nextConfig from "../next.config";

const nonce = "abcdefghijklmnopqrstuvwx12345678";
describe("document security policy", () => {
  it("excludes authorization callbacks and media tickets from development request logs", () => {
    const logging = nextConfig.logging;
    if (!logging || typeof logging.incomingRequests !== "object") throw new Error("Sensitive request logging must be filtered");
    const filters = logging.incomingRequests.ignore ?? [];
    for (const url of ["/api/qq/login/callback?code=fixture&state=fixture", "/api/music/audio?ticket=fixture", "/api/qq/audio?ticket=fixture"]) {
      expect(filters.some(pattern => pattern.test(url))).toBe(true);
    }
    expect(filters.some(pattern => pattern.test("/api/health"))).toBe(false);
  });
  it("gives only the universe build same-origin embedding and external user media without inline scripts", () => {
    const policy = universeContentSecurityPolicy();
    expect(policy).toContain("media-src 'self' blob: data: https:");
    expect(policy).toContain("frame-ancestors 'self'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(contentSecurityPolicy(nonce, false)).toContain("frame-ancestors 'none'");
  });
  it("allows only nonce scripts in production while retaining the local scene resources", () => {
    const policy = contentSecurityPolicy(nonce, false);
    const scripts = policy.split(";").find((part) => part.includes("script-src"))!;
    expect(scripts).toContain("'nonce-" + nonce + "'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
    for (const rule of ["media-src 'self' blob:", "img-src 'self' blob: data:", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'"]) {
      expect(policy).toContain(rule);
    }
  });
  it("permits the development debugger only in development", () => {
    expect(contentSecurityPolicy(nonce, true)).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy(nonce, false)).not.toContain(" ws:");
  });
  it("rejects a nonce containing policy or header injection", () => {
    expect(() => contentSecurityPolicy("x'; script-src *", false)).toThrow();
  });
  it("keeps embedding disabled until exact HTTPS parents have been configured", () => {
    expect(frameAncestorSources()).toEqual([]);
    const parents = frameAncestorSources("https://h5.example.com/ https://h5.example.com https://panel.example.com");
    expect(parents).toEqual(["https://h5.example.com", "https://panel.example.com"]);
    expect(contentSecurityPolicy(nonce, false, parents)).toContain("frame-ancestors https://h5.example.com https://panel.example.com");
  });
  it.each(["*", "https://*.example.com", "http://h5.example.com", "https://h5.example.com/panel", "https://user:pass@h5.example.com", "https://h5.example.com?secret=x"])("rejects unsafe embedding configuration %s", (value) => {
    expect(() => frameAncestorSources(value)).toThrow();
  });
});
