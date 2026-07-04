import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.NIRS4ALL_UI_BASE ?? "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  publicDir: "public",
  root: "site",
});
