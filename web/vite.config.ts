import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // FastAPI runs on :8000 in development (see the Makefile).
    proxy: { "/api": "http://localhost:8000" },
  },
});
