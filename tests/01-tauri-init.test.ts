import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

const shellDir = join(__dirname, "..", "shell");

const requiredFiles = [
  "Cargo.toml",
  "tauri.conf.json",
  "build.rs",
  "src/main.rs",
  "src/lib.rs",
];

describe("Tauri Init", () => {
  for (const file of requiredFiles) {
    it(`${file} exists`, () => {
      expect(existsSync(join(shellDir, file))).toBe(true);
    });
  }
});
