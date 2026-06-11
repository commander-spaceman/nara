import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const shellDir = join(root, "shell");

let failures = 0;

// Test 1: health_check function exists in lib.rs
{
  const libRs = readFileSync(join(shellDir, "src", "lib.rs"), "utf-8");
  try {
    ok(libRs.includes("fn health_check"), "lib.rs has health_check command");
    console.log("  PASS  health_check command defined");
  } catch (err) {
    console.error("  FAIL  lib.rs: " + err.message);
    failures++;
  }
  try {
    ok(libRs.includes("HealthResponse"), "lib.rs has HealthResponse struct");
    console.log("  PASS  HealthResponse struct defined");
  } catch (err) {
    console.error("  FAIL  lib.rs: " + err.message);
    failures++;
  }
  try {
    ok(libRs.includes("invoke_handler"), "lib.rs registers invoke_handler");
    console.log("  PASS  invoke_handler registered");
  } catch (err) {
    console.error("  FAIL  lib.rs: " + err.message);
    failures++;
  }
}

// Test 2: cargo check compiles
{
  try {
    execSync("cargo check", { cwd: shellDir, stdio: "pipe", timeout: 120000 });
    console.log("  PASS  cargo check succeeds");
  } catch (err) {
    console.error("  FAIL  cargo check: " + err.message);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}

console.log(`\nAll 4 tests passed.`);
