import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  preview: { allowedHosts: true },
  build: { rollupOptions: { input: "./index.html" } },
  server: {
    fs: { allow: ["."] },
    watch: { ignored: ["**/target/**"] },
  },
});
