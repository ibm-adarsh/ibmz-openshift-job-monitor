import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages project site: https://<user>.github.io/ibmz-openshift-job-monitor/
const base = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  base,
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
