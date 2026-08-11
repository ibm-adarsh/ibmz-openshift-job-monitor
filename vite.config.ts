import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxies avoid browser CORS for Prow HTML; Sippy already sends ACAO: *.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/proxy/sippy": {
        target: "https://sippy.dptools.openshift.org",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/proxy\/sippy/, ""),
      },
      "/proxy/prow": {
        target: "https://prow.ci.openshift.org",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/proxy\/prow/, ""),
      },
    },
  },
});
