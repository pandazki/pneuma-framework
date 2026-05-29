import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The studio UI builds to dist/ and is served by the Bun control-plane server.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
});
