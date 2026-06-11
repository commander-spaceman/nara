import { ok } from "node:assert";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const srcTauri = join(root, "shell");

const requiredFiles = [
  "Cargo.toml",
  "tauri.conf.json",
  "build.rs",
  "src/main.rs",
  "src/lib.rs",
];

let failures = 0;

for (const file of requiredFiles) {
  const fullPath = join(srcTauri, file);
  try {
    ok(existsSync(fullPath), `${file} exists`);
    console.log(`  PASS  ${file}`);
  } catch (err) {
    console.error(`  FAIL  ${file}: ${err.message}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}

console.log(`\nAll ${requiredFiles.length} tests passed.`);
