import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const shellDir = join(__dirname, "..", "shell");
const libRs = readFileSync(join(shellDir, "src", "lib.rs"), "utf-8");

describe("Health Check IPC", () => {
  it("defines health_check command", () => {
    expect(libRs).toContain("fn health_check");
  });
  it("defines HealthResponse struct", () => {
    expect(libRs).toContain("HealthResponse");
  });
  it("registers invoke_handler", () => {
    expect(libRs).toContain("invoke_handler");
  });
  it("cargo check compiles", () => {
    expect(() => {
      execSync("cargo check", {
        cwd: shellDir,
        stdio: "pipe",
        timeout: 60000,
      });
    }).not.toThrow();
  }, 70000);
});
