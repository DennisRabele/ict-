import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default {
  root: __dirname,
  base: "./",
  build: {
    rollupOptions: {
      input: {
        app: resolve(__dirname, "index.html"),
        login: resolve(__dirname, "mobile-login.html")
      }
    }
  },
  server: {
    fs: {
      allow: [resolve(__dirname, "..")]
    }
  }
};
