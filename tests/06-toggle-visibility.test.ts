import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const compDir = join(root, "src", "components");

describe("Toggle Visibility Shortcuts", () => {
  describe("debug panel (D key)", () => {
    const panel = readFileSync(join(compDir, "debug-panel.ts"), "utf-8");

    it("has toggle method", () => {
      expect(panel).toContain("toggle()");
    });

    it("listens for d key", () => {
      expect(panel).toContain('e.key === "d"');
    });

    it("ignores input/textarea/select", () => {
      expect(panel).toContain('tag === "INPUT"');
      expect(panel).toContain('tag === "TEXTAREA"');
      expect(panel).toContain('tag === "SELECT"');
    });

    it("cycles between expanded and out states", () => {
      expect(panel).toContain('visibility === "out"');
      expect(panel).toContain('visibility = "expanded"');
      expect(panel).toContain('visibility = "out"');
    });

    it("logs debug state changes", () => {
      expect(panel).toContain("[debug]");
      expect(panel).toContain("active");
      expect(panel).toContain("hidden");
    });

    it("defaults to out", () => {
      expect(panel).toContain('= "out"');
    });
  });

  describe("input toggle (E/Escape keys)", () => {
    const app = readFileSync(join(compDir, "app.ts"), "utf-8");
    const input = readFileSync(join(compDir, "input-bar.ts"), "utf-8");
    const controls = readFileSync(join(compDir, "controls.ts"), "utf-8");

    it("app listens for e and Escape keys", () => {
      expect(app).toContain('e.key === "e"');
      expect(app).toContain('e.key === "Escape"');
    });

    it("app calls controls.toggleInput on keypress", () => {
      expect(app).toContain("this.controls.toggleInput()");
    });

    it("escape blurs chat input", () => {
      expect(input).toContain('e.key === "Escape"');
      expect(input).toContain("input.blur()");
    });

    it("controls remembers last mode", () => {
      expect(controls).toContain("lastMode");
      expect(controls).toContain("toggleInput()");
    });

    it("controls starts with no active mode", () => {
      expect(controls).toContain("= null");
    });
  });
});
