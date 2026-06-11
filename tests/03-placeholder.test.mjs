import { ok } from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const compDir = join(root, "src", "components");

let failures = 0;

// component source files
{
  const components = [
    "app.ts",
    "debug-panel.ts",
    "model-area.ts",
    "subtitle-box.ts",
    "controls.ts",
    "input-bar.ts",
  ];
  for (const file of components) {
    try {
      ok(existsSync(join(compDir, file)), `component ${file} exists`);
      console.log(`  PASS  component ${file}`);
    } catch (err) {
      console.error(`  FAIL  component: ${err.message}`);
      failures++;
    }
  }
}

// index.html base
{
  const html = readFileSync(join(root, "index.html"), "utf-8");
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
  try {
    ok(html.includes('id="app"'), "index.html has #app mount point");
    console.log("  PASS  index.html has #app");
  } catch (err) {
    console.error("  FAIL  index.html: " + err.message);
    failures++;
  }
}

// app.ts composes all components
{
  const app = readFileSync(join(compDir, "app.ts"), "utf-8");
  const imports = [
    "DebugPanel",
    "ModelArea",
    "SubtitleBox",
    "Controls",
    "InputBar",
  ];
  for (const name of imports) {
    try {
      ok(app.includes(name), `app.ts imports ${name}`);
      console.log(`  PASS  app.ts imports ${name}`);
    } catch (err) {
      console.error(`  FAIL  app.ts: ${err.message}`);
      failures++;
    }
  }
}

// style.css
{
  const css = readFileSync(join(root, "src", "style.css"), "utf-8");
  const checks = [
    ["rgba(0, 0, 0, 0.004)", "rgba background"],
    ["user-select: none", "disables selection"],
    ["flex-direction: column", "column layout"],
    ["#debug-panel", "debug panel styles"],
    [".debug-collapsed", "collapsed debug style"],
    ["#model-area", "model area styles"],
    ["#subtitle-box", "subtitle box styles"],
    ["#controls", "controls styles"],
    ["#input-bar", "input bar styles"],
    ["ctrl-btn", "control button styles"],
    [".ctrl-btn.active", "active button style"],
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

// main.ts
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
  try {
    ok(main.includes("import { App }"), "main.ts creates App");
    console.log("  PASS  main.ts creates App");
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

console.log(`\nAll 27 tests passed.`);
