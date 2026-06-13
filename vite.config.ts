import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

const boundsDir = path.resolve(__dirname, "build", "bounds");

function serveGeneratedBounds(): Plugin {
  return {
    name: "serve-generated-bounds",
    configureServer(server) {
      server.middlewares.use("/build/bounds", (req, res, next) => {
        if (!req.url) {
          next();
          return;
        }

        const relativePath = req.url.replace(/^\/+/, "");
        const filePath = path.join(boundsDir, relativePath);

        if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
          next();
          return;
        }

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(readFileSync(filePath));
      });
    },
    writeBundle(options) {
      if (!existsSync(boundsDir)) return;

      const outDir = options.dir
        ? path.resolve(__dirname, options.dir)
        : path.resolve(__dirname, "dist");
      const targetDir = path.join(outDir, "build", "bounds");
      mkdirSync(targetDir, { recursive: true });

      for (const name of readdirSync(boundsDir)) {
        if (!name.endsWith(".json")) continue;
        copyFileSync(path.join(boundsDir, name), path.join(targetDir, name));
      }
    },
  };
}

export default defineConfig({
  plugins: [serveGeneratedBounds()],
  resolve: {
    alias: {
      "three/addons/": path.resolve(
        __dirname,
        "node_modules/three/examples/jsm/",
      ),
    },
  },
  server: {
    watch: {
      ignored: ["**/shell/target/**"],
    },
  },
});
