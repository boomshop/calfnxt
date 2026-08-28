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
const pluginId = process.env.CALFNXT_PLUGIN?.trim() || "";

const knownPlugins = [
  "equalizer",
  "stereo",
  "transients",
  "compressor",
  "expander",
  "deesser",
  "delay",
  "reverb",
  "mbcomp",
  "limiter",
  "mblimiter",
  "harmonics",
  "analyzer",
  "filter",
  "ringmod",
  "pulsator",
  "crusher",
  "phaser",
  "flanger",
  "chorus",
  "split",
  "tuner",
] as const;

export default defineConfig(({ command }) => {
  if (command === "build") {
    if (!pluginId || !(knownPlugins as readonly string[]).includes(pluginId)) {
      throw new Error(
        "Production UI build requires CALFNXT_PLUGIN=<id> " +
          `(one of: ${knownPlugins.join(", ")}). Use: npm run build`,
      );
    }
  }

  return {
    plugins: [react(), stripCrossorigin()],
    base: "./",
    root,
    build: pluginId
      ? {
          // One build per plugin → single JS bundle + one CSS (+ fonts/logo).
          outDir: path.resolve(root, `dist/plugins/${pluginId}`),
          emptyOutDir: true,
          assetsDir: "assets",
          cssCodeSplit: false,
          modulePreload: { polyfill: false },
          rollupOptions: {
            input: path.resolve(root, `src/html/${pluginId}.html`),
            output: {
              // Single-entry: inline any leftover dynamic imports into one JS.
              inlineDynamicImports: true,
              entryFileNames: "assets/[name]-[hash].js",
              assetFileNames: "assets/[name]-[hash][extname]",
            },
          },
        }
      : {
          // Dev server only (index.html). Not used for production.
          outDir: path.resolve(root, "dist"),
        },
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      open: "/#equalizer",
    },
  };
});
