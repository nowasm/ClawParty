import path from "node:path";

import prerender from "@prerenderer/rollup-plugin";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vitest/config";

const isVercel = !!process.env.VERCEL;

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
  },
  plugins: [
    react(),
    // Skip prerendering on Vercel — its build environment lacks Chrome system dependencies
    !isVercel && prerender({
      routes: [
        "/",
        "/popular",
        "/docs",
        "/docs/humans",
        "/docs/technical",
        "/docs/about",
      ],
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    onConsoleLog(log) {
      return !log.includes("React Router Future Flag Warning");
    },
    env: {
      DEBUG_PRINT_LIMIT: '0', // Suppress DOM output that exceeds AI context windows
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));