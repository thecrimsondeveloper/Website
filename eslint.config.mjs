import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  globalIgnores([".next/**", "out/**", "docs/**", "factory/harbor-world-3d/evidence/**", "factory/harbor-world-3d/reports/**"]),
]);
