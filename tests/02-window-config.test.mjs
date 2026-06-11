import { deepStrictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, "..", "shell", "tauri.conf.json");
const config = JSON.parse(readFileSync(configPath, "utf-8"));

const window = config.app.windows[0];

const cases = [
  ["identifier", config.identifier, "com.nara.desktop"],
  ["productName", config.productName, "Nara'Korrin"],
  ["title", window.title, "Nara'Korrin"],
  ["width", window.width, 550],
  ["height", window.height, 700],
  ["transparent", window.transparent, true],
  ["decorations", window.decorations, false],
  ["alwaysOnTop", window.alwaysOnTop, true],
  ["skipTaskbar", window.skipTaskbar, true],
  ["resizable", window.resizable, false],
  ["fullscreen", window.fullscreen, false],
];

let failures = 0;

for (const [name, actual, expected] of cases) {
  try {
    deepStrictEqual(actual, expected, `${name} should be ${expected}`);
    console.log(`  PASS  ${name}`);
  } catch (err) {
    console.error(`  FAIL  ${name}: ${err.message}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}

console.log(`\nAll ${cases.length} tests passed.`);
