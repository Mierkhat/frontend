import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import copy from "./copy/src/en.json" with { type: "json" };
export default defineConfig({
  plugins: [
    react(),
    {
      name: "mierkhat-metadata",
      transformIndexHtml(html, context) {
        if (context.server)
          html = html
            .replace(
              "script-src 'self'; style-src 'self';",
              "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
            )
            .replace("ws://localhost:5173;", "ws:;");
        return html
          .replaceAll("%TITLE%", copy["title.home"])
          .replaceAll("%ALT%", copy["brand.alt"]);
      },
    },
  ],
  server: { host: "0.0.0.0", proxy: { "/v1": "http://127.0.0.1:3001" } },
  preview: { host: "0.0.0.0", proxy: { "/v1": "http://127.0.0.1:3001" } },
  build: { chunkSizeWarningLimit: 1100 },
});
