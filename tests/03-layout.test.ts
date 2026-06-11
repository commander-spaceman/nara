import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const compDir = join(root, "src", "components");

describe("Components & Layout", () => {
  describe("component files", () => {
    const components = [
      "app.ts",
      "debug-panel.ts",
      "model-area.ts",
      "subtitle-box.ts",
      "controls.ts",
      "input-bar.ts",
    ];
    for (const file of components) {
      it(`component ${file} exists`, () => {
        expect(existsSync(join(compDir, file))).toBe(true);
      });
    }
  });

  describe("index.html", () => {
    const html = readFileSync(join(root, "index.html"), "utf-8");
    it("loads main.ts", () => {
      expect(html).toContain('src="/src/main.ts"');
    });
    it("has drag region in model area", () => {
      const app = readFileSync(join(compDir, "app.ts"), "utf-8");
      expect(app).toContain("data-tauri-drag-region");
    });
    it("has #app mount point", () => {
      expect(html).toContain('id="app"');
    });
  });

  describe("app.ts imports", () => {
    const app = readFileSync(join(compDir, "app.ts"), "utf-8");
    const imports = [
      "DebugPanel",
      "ModelArea",
      "SubtitleBox",
      "Controls",
      "InputBar",
      "saveMessage",
      "startSession",
    ];
    for (const name of imports) {
      it(`imports ${name}`, () => {
        expect(app).toContain(name);
      });
    }
  });

  describe("memory module", () => {
    it("memory.ts exists", () => {
      expect(existsSync(join(root, "src", "modules", "memory.ts"))).toBe(true);
    });
    it("llm.ts exists", () => {
      expect(existsSync(join(root, "src", "modules", "llm.ts"))).toBe(true);
    });
  });

  describe("style.css", () => {
    const css = readFileSync(join(root, "src", "style.css"), "utf-8");
    it("has rgba background", () => {
      expect(css).toContain("rgba(0, 0, 0, 0.004)");
    });
    it("disables selection", () => {
      expect(css).toContain("user-select: none");
    });
    it("has column layout", () => {
      expect(css).toContain("flex-direction: column");
    });
    it("has debug panel styles", () => {
      expect(css).toContain("#debug-panel");
    });
    it("has collapsed debug style", () => {
      expect(css).toContain(".debug-collapsed");
    });
    it("has model area styles", () => {
      expect(css).toContain("#model-area");
    });
    it("has subtitle box styles", () => {
      expect(css).toContain("#subtitle-box");
    });
    it("has controls styles", () => {
      expect(css).toContain("#controls");
    });
    it("has input bar styles", () => {
      expect(css).toContain("#input-bar");
    });
    it("has control button styles", () => {
      expect(css).toContain("ctrl-btn");
    });
    it("has active button style", () => {
      expect(css).toContain(".ctrl-btn.active");
    });
  });

  describe("main.ts", () => {
    it("exists", () => {
      expect(existsSync(join(root, "src", "main.ts"))).toBe(true);
    });
    const main = readFileSync(join(root, "src", "main.ts"), "utf-8");
    it("has drag support", () => {
      expect(main).toContain("startDragging");
    });
    it("creates App", () => {
      expect(main).toContain("import { App }");
    });
  });

  describe("cleanup", () => {
    it("counter.ts removed", () => {
      expect(existsSync(join(root, "src", "counter.ts"))).toBe(false);
    });
  });
});
