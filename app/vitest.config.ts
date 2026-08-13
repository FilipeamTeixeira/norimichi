import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    // Mirrors the `@/*` alias in tsconfig.json.
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    /**
     * The provider tests reach a live segment index (3.2MB parsed and indexed)
     * and, for two of the three, the public internet. The default 5s is not
     * enough for either.
     */
    testTimeout: 60_000,
    /**
     * These tests hit third-party services. Running the file's cases in
     * parallel with everything else would mean several concurrent requests to
     * a volunteer-run server, which is precisely what the BRouter provider's
     * own comments say not to do.
     */
    fileParallelism: false,
  },
});
