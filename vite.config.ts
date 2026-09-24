import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import manifest from "./manifest.config.ts";

export default defineConfig(({ command, mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // Only on `build`. `npm run dev` is a watch build, because an extension
    // loads from `dist/` and there is no dev server hosting its pages. The one
    // `serve` we do run is `npm run replica`, which serves the static test
    // pages in `replica/` and must not drag the extension pipeline in with it.
    ...(command === "build" ? [crx({ manifest })] : []),
  ],

  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },

  build: {
    target: "esnext",
    sourcemap: mode === "development",
    rollupOptions: {
      input: {
        sidepanel: "src/sidepanel/index.html",
      },
    },
  },
}));
