import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const isProduction = process.env.NODE_ENV === "production";
const isReplit = process.env.REPL_ID !== undefined;

const port = Number(process.env.PORT || (isProduction ? "3000" : "0"));
if (!process.env.PORT && !isProduction) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const basePath = process.env.BASE_PATH || "/";

const plugins: any[] = [react(), tailwindcss()];

if (!isProduction && isReplit) {
  const runtimeErrorOverlay = await import("@replit/vite-plugin-runtime-error-modal").then(m => m.default);
  plugins.push(runtimeErrorOverlay());
  const cartographer = await import("@replit/vite-plugin-cartographer").then(m => m.cartographer);
  plugins.push(cartographer({ root: path.resolve(import.meta.dirname, "..") }));
  const devBanner = await import("@replit/vite-plugin-dev-banner").then(m => m.devBanner);
  plugins.push(devBanner());
} else if (!isProduction) {
  const runtimeErrorOverlay = await import("@replit/vite-plugin-runtime-error-modal").then(m => m.default);
  plugins.push(runtimeErrorOverlay());
}

export default defineConfig({
  base: basePath,
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
