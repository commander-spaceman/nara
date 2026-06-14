import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const shellDir = join(root, "shell");

describe("Background Theme Detection", () => {
  describe("Rust side", () => {
    it("background.rs exists", () => {
      expect(existsSync(join(shellDir, "src", "background.rs"))).toBe(true);
    });

    it("background.rs detects background via GetPixel", () => {
      const bg = readFileSync(join(shellDir, "src", "background.rs"), "utf-8");
      expect(bg).toContain("GetPixel");
      expect(bg).toContain("GetDC");
      expect(bg).toContain("background-theme");
      expect(bg).toContain("luminance");
      expect(bg).toContain("background_set_probe");
      expect(bg).toContain("ProbeRect");
      expect(bg).toContain("inner_position");
      expect(bg).toContain("inner_size");
      expect(bg).toContain("radius_x");
      expect(bg).toContain("radius_y");
      expect(bg).toContain("REQUIRED_STABLE_POLLS");
    });

    it("lib.rs imports and calls detect_background", () => {
      const lib = readFileSync(join(shellDir, "src", "lib.rs"), "utf-8");
      expect(lib).toContain("mod background");
      expect(lib).toContain("background::detect_background");
    });

    it("Cargo.toml has windows-sys GDI dependency", () => {
      const cargo = readFileSync(join(shellDir, "Cargo.toml"), "utf-8");
      expect(cargo).toContain("windows-sys");
      expect(cargo).toContain("Win32_Graphics_Gdi");
    });
  });

  describe("Frontend side", () => {
    it("main.ts listens for background-theme event", () => {
      const main = readFileSync(join(root, "src", "main.ts"), "utf-8");
      expect(main).toContain("background-theme");
      expect(main).toContain("import { listen }");
      expect(main).toContain("data-theme");
      expect(main).toContain("app.setTheme(event.payload)");
    });

    it("style.css has light theme variables", () => {
      const css = readFileSync(join(root, "src", "style.css"), "utf-8");
      expect(css).toContain('[data-theme="light"]');
      expect(css).toContain("--bg");
      expect(css).toContain("--text");
      expect(css).toContain("--grid-bg");
    });

    it("style.css has default dark theme", () => {
      const css = readFileSync(join(root, "src", "style.css"), "utf-8");
      expect(css).toContain("rgba(16, 16, 24, 0.94)");
      expect(css).toContain("rgba(255, 255, 255, 0.85)");
    });
  });
});
