import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // 相对资源路径让构建产物可部署在 GitHub Pages 的仓库子目录。
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: { manualChunks: { three: ["three"] } },
    },
  },
});
