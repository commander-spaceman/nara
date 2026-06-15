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

  describe("model guides defaults", () => {
    const debugPanel = readFileSync(join(compDir, "debug-panel.ts"), "utf-8");
    const modelArea = readFileSync(join(compDir, "model-area.ts"), "utf-8");
    const boundsEngine = readFileSync(
      join(root, "src", "3d", "bounds-engine.ts"),
      "utf-8",
    );

    it("starts with debug guides disabled", () => {
      expect(debugPanel).toContain("modelGuidesVisible = false");
    });

    it("starts with model guides disabled", () => {
      expect(modelArea).toContain("guidesVisible = false");
    });

    it("starts with bounds guides disabled", () => {
      expect(boundsEngine).toContain("guidesVisible = false");
    });
  });

  describe("grid background", () => {
    const sceneManager = readFileSync(
      join(root, "src", "3d", "scene-manager.ts"),
      "utf-8",
    );
    const app = readFileSync(join(compDir, "app.ts"), "utf-8");
    const modelArea = readFileSync(join(compDir, "model-area.ts"), "utf-8");

    it("uses the shorter side to size square cells", () => {
      expect(sceneManager).toContain("GRID_DIVISIONS = 24");
      expect(sceneManager).toContain(
        "const cellPx = Math.min(w, h) / GRID_DIVISIONS",
      );
    });

    it("rebuilds the grid from theme variables", () => {
      expect(sceneManager).toContain('getPropertyValue("--grid-bg")');
      expect(sceneManager).toContain('getPropertyValue("--grid-line")');
      expect(sceneManager).toContain('getPropertyValue("--grid-line-strong")');
      expect(sceneManager).toContain('getPropertyValue("--grid-axis")');
      expect(sceneManager).toContain("setTheme(theme: string)");
    });

    it("tracks the model area center for theme sampling", () => {
      expect(app).toContain("background_set_probe");
      expect(app).toContain("getBoundingClientRect");
      expect(app).toContain("width: rect.width");
      expect(app).toContain("height: rect.height");
      expect(app).toContain("ResizeObserver");
      expect(modelArea).toContain("setTheme(theme: string)");
    });
  });

  describe("chat width", () => {
    const app = readFileSync(join(compDir, "app.ts"), "utf-8");
    const css = readFileSync(join(root, "src", "style.css"), "utf-8");

    it("tracks idle projected frame width for the chat container", () => {
      expect(app).toContain("idleFrameWidthPx");
      expect(app).toContain("this.idleFrameWidthPx == null");
      expect(app).toContain('snapshot.activeAnimation === "idle"');
      expect(app).toContain('"--chat-width"');
      expect(app).toContain("idleFrameWidthPx}px");
    });

    it("centers bottom section and limits it to the idle width", () => {
      expect(css).toContain("align-self: center");
      expect(css).toContain("width: min(100%, var(--chat-width, 100%))");
    });
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
      "getCurrentWindow",
      "ModelArea",
      "SubtitleBox",
      "Controls",
      "InputBar",
      "ChatService",
      "AudioPlayer",
      "startSession",
      "endSession",
    ];
    for (const name of imports) {
      it(`imports ${name}`, () => {
        expect(app).toContain(name);
      });
    }
  });

  describe("memory module", () => {
    it("db.ts exists", () => {
      expect(existsSync(join(root, "src", "memory", "db.ts"))).toBe(true);
    });
    it("llm.ts exists", () => {
      expect(existsSync(join(root, "src", "memory", "llm.ts"))).toBe(true);
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
    it("keeps subtitle box at chat width", () => {
      expect(css).toContain("#subtitle-box");
      expect(css).toContain("width: 100%");
      expect(css).toContain("padding: 8px 0");
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

  describe("chat commands", () => {
    const app = readFileSync(join(compDir, "app.ts"), "utf-8");
    const modal = readFileSync(join(compDir, "session-modal.ts"), "utf-8");

    it("supports /help", () => {
      expect(app).toContain('text === "/help"');
      expect(app).toContain("this.sessionModal.showHelp()");
    });

    it("supports /exit", () => {
      expect(app).toContain('text === "/exit"');
      expect(app).toContain("getCurrentWindow().close()");
    });

    it("supports /new", () => {
      expect(app).toContain('text === "/new"');
      expect(app).toContain("startFreshSession()");
    });

    it("supports /debug", () => {
      expect(app).toContain('text === "/debug"');
      expect(app).toContain("this.debugPanel.toggle()");
    });

    it("supports /session", () => {
      expect(app).toContain('text === "/session"');
      expect(app).toContain("session ${getSessionId().slice(0, 10)}");
    });

    it("keeps only /history and removes /sessions", () => {
      expect(app).toContain('text === "/history"');
      expect(app).not.toContain('text === "/sessions"');
    });

    it("shows help content in the modal", () => {
      expect(modal).toContain("showHelp()");
      expect(modal).toContain("chat commands");
      expect(modal).toContain("/new");
      expect(modal).toContain("/debug");
      expect(modal).toContain("/session");
      expect(modal).toContain("/exit");
      expect(modal).not.toContain("/sessions");
    });
  });

  describe("cleanup", () => {
    it("counter.ts removed", () => {
      expect(existsSync(join(root, "src", "counter.ts"))).toBe(false);
    });
  });
});
