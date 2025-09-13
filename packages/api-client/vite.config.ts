import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "TurnstileApiClient",
      formats: ["es", "cjs"],
      fileName: (format) => (format === "es" ? "index.js" : "index.cjs"),
    },
    target: "es2022",
    sourcemap: true,
    minify: true,
    rollupOptions: {
      external: [],
      output: {
        preserveModules: false,
      },
    },
  },
});
