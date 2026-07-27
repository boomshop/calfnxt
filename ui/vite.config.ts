import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/** WebKitGTK custom schemes reject CORS-mode fetches; Vite tags assets with crossorigin. */
function stripCrossorigin(): Plugin {
  return {
    name: "calf-strip-crossorigin",
    transformIndexHtml(html) {
      return html
        .replace(/<script([^>]*?) crossorigin([^>]*)>/gi, "<script$1$2>")
        .replace(/<link([^>]*?) crossorigin([^>]*)>/gi, "<link$1$2>");
    },
  };
}

export default defineConfig({
  plugins: [react(), stripCrossorigin()],
  base: "./",
  root: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    assetsDir: "assets",
    modulePreload: { polyfill: false },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    open: "/#equalizer",
  },
});
