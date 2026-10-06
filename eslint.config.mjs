import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  { files: ["integrations/mineradio/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  globalIgnores(["integrations/mineradio/vendor/**", "public/universe/**"]),
  globalIgnores([".next/**", ".next-test/**", ".next-ui-review/**", ".next-hall-review/**", ".next-player-review/**", ".next-baseline/**", ".next-qq-integration/**", "work/**", "out/**", "coverage/**", "next-env.d.ts", "playwright-report/**", "test-results/**"]),
]);
