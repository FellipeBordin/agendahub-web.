import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "DEV_");
  const tunnelHost = env.DEV_TUNNEL_HOST?.trim();

  return {
    plugins: [react(), tailwindcss()],

    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },

    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,

      allowedHosts: tunnelHost ? [tunnelHost] : [],

      proxy: {
        "/api": {
          target: "http://127.0.0.1:3000",
          changeOrigin: true,
        },
      },
    },
  };
});
