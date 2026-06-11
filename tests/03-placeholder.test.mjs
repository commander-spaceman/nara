import { ok } from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

let failures = 0;

// index.html layout tests
{
  const html = readFileSync(join(root, "index.html"), "utf-8");
  const sections = [
    "debug-panel",
    "model-area",
    "subtitle-box",
    "controls",
    "input-container",
    "btn-mic",
    "btn-chat",
    "chat-input",
    "mic-status-area",
  ];
  for (const id of sections) {
    try {
      ok(html.includes(`id="${id}"`), `index.html has #${id}`);
      console.log(`  PASS  index.html has #${id}`);
    } catch (err) {
      console.error(`  FAIL  index.html: ${err.message}`);
      failures++;
    }
  }
  try {
    ok(html.includes('src="/src/main.ts"'), "index.html loads main.ts");
    console.log("  PASS  index.html loads main.ts");
  } catch (err) {
    console.error("  FAIL  index.html: " + err.message);
    failures++;
  }
  try {
    ok(html.includes("data-tauri-drag-region"), "index.html has drag region");
    console.log("  PASS  index.html drag region");
  } catch (err) {
    console.error("  FAIL  index.html: " + err.message);
    failures++;
  }
}

// style.css tests
{
  const css = readFileSync(join(root, "src", "style.css"), "utf-8");
  const checks = [
    ["rgba(0, 0, 0, 0.004)", "rgba background"],
    ["user-select: none", "disables selection"],
    ["flex-direction: column", "column layout"],
    ["#debug-panel", "debug panel styles"],
    ["#model-area", "model area styles"],
    ["#subtitle-box", "subtitle box styles"],
    ["#controls", "controls styles"],
    ["#input-container", "input container styles"],
    ["ctrl-btn", "control button styles"],
  ];
  for (const [needle, label] of checks) {
    try {
      ok(css.includes(needle), `style.css has ${label}`);
      console.log(`  PASS  style.css ${label}`);
    } catch (err) {
      console.error(`  FAIL  style.css: ${err.message}`);
      failures++;
    }
  }
}

// main.ts tests
{
  try {
    ok(existsSync(join(root, "src", "main.ts")), "main.ts exists");
    console.log("  PASS  main.ts exists");
  } catch (err) {
    console.error("  FAIL  main.ts: " + err.message);
    failures++;
  }
  const main = readFileSync(join(root, "src", "main.ts"), "utf-8");
  try {
    ok(main.includes("startDragging"), "main.ts has drag support");
    console.log("  PASS  main.ts drag support");
  } catch (err) {
    console.error("  FAIL  main.ts: " + err.message);
    failures++;
  }
}

// No stale files
{
  try {
    ok(!existsSync(join(root, "src", "counter.ts")), "counter.ts removed");
    console.log("  PASS  counter.ts removed");
  } catch (err) {
    console.error("  FAIL  stale file: " + err.message);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}

console.log(`\nAll 22 tests passed.`);
