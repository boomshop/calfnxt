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

const root = path.resolve(__dirname);

export default defineConfig({
  plugins: [react(), stripCrossorigin()],
  base: "./",
  root,
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    assetsDir: "assets",
    manifest: true,
    modulePreload: { polyfill: false },
    rollupOptions: {
      // Per-plugin HTML entries → VST3 packs only that entry's asset graph.
      // Dev still uses index.html + hash router (not part of production input).
      input: {
        equalizer: path.resolve(root, "src/html/equalizer.html"),
        stereo: path.resolve(root, "src/html/stereo.html"),
        transients: path.resolve(root, "src/html/transients.html"),
        compressor: path.resolve(root, "src/html/compressor.html"),
        deesser: path.resolve(root, "src/html/deesser.html"),
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    open: "/#equalizer",
  },
});
