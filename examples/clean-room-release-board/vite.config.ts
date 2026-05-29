import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The client bundle is emitted to dist/client so the Bun/Vercel server can
// serve it as static assets while the Hono API owns /api/*.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
});
