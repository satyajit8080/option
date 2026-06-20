import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Mirrors the "@/*" path in tsconfig.json — tsc only type-checks
      // against that mapping, it doesn't teach Rollup/esbuild how to
      // actually resolve the import, so it has to be declared here too.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Forward API + WS calls to the FastAPI backend during local dev so
      // the frontend can just call relative paths like "/api/...".
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // recharts + lightweight-charts are the two heavy dependencies here;
        // splitting them into their own vendor chunks means a change to app
        // code doesn't invalidate the browser cache for these large, rarely
        // -changing libraries.
        manualChunks: {
          "vendor-recharts": ["recharts"],
          "vendor-lightweight-charts": ["lightweight-charts"],
          "vendor-react": ["react", "react-dom"],
        },
      },
    },
  },
});
