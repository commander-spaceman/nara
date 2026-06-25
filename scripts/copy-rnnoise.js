import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const src = "node_modules/@jitsi/rnnoise-wasm/dist/rnnoise-sync.js";
const dest = "public/rnnoise-sync.js";

if (!existsSync("public")) {
  mkdirSync("public");
}
copyFileSync(src, dest);
console.log("rnnoise-sync.js copied to public/");
