import { z } from "zod";

// Strict document CSP forbids eval. Skip Zod's JIT capability probe as well as
// its dynamic validator path; both browser and server keep the same rules.
z.config({ jitless: true });

export { z };
