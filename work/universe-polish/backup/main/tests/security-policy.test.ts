import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, frameAncestorSources } from "@/lib/server/security-policy";

const nonce = "abcdefghijklmnopqrstuvwx12345678";
describe("document security policy", () => {
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
