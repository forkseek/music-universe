import { describe, expect, it } from "vitest";
import { z } from "@/lib/validation";

describe("CSP compatible validation", () => {
  it("turns off dynamic compilation and its eval capability probe", () => {
    expect(z.config().jitless).toBe(true);
  });
  it("keeps successful parsing, field validation and unknown-field rejection", () => {
    const input = z.object({ name: z.string().trim().min(1).max(100) }).strict();
    expect(input.parse({ name: " Music " })).toEqual({ name: "Music" });
    expect(input.safeParse({ name: "" }).success).toBe(false);
    expect(input.safeParse({ name: "Music", userId: "another-user" }).success).toBe(false);
  });
});
