import { ok } from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

let failures = 0;

// index.html tests
{
  const html = readFileSync(join(root, "index.html"), "utf-8");
  try {
    ok(html.includes("Placeholder"), 'index.html contains "Placeholder"');
    console.log('  PASS  index.html contains "Placeholder"');
  } catch (err) {
    console.error("  FAIL  index.html: " + err.message);
    failures++;
  }
  try {
    ok(html.includes('src="/src/main.ts"'), "index.html loads main.ts");
    console.log("  PASS  index.html loads main.ts");
  } catch (err) {
    console.error("  FAIL  index.html: " + err.message);
    failures++;
  }
}

// style.css tests
{
  const css = readFileSync(join(root, "src", "style.css"), "utf-8");
  try {
    ok(css.includes("transparent"), "style.css has transparent background");
    console.log("  PASS  style.css has transparent");
  } catch (err) {
    console.error("  FAIL  style.css: " + err.message);
    failures++;
  }
  try {
    ok(css.includes("user-select: none"), "style.css disables text selection");
    console.log("  PASS  style.css disables selection");
  } catch (err) {
    console.error("  FAIL  style.css: " + err.message);
    failures++;
  }
  try {
    ok(css.includes("align-items: center"), "style.css centers vertically");
    console.log("  PASS  style.css centers content");
  } catch (err) {
    console.error("  FAIL  style.css: " + err.message);
    failures++;
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

console.log(`\nAll 7 tests passed.`);
