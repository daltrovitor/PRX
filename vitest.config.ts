import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
    // Logs estruturados do PRX BANK (lib/asaas/log.ts) fora da saída dos testes.
    env: { PRX_BANK_LOG: "off" },
  },
});
