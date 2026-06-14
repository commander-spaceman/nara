import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const configPath = join(__dirname, "..", "shell", "tauri.conf.json");
const config = JSON.parse(readFileSync(configPath, "utf-8"));
const window = config.app.windows[0];

describe("Window Config", () => {
  it("identifier is com.nara.desktop", () => {
    expect(config.identifier).toBe("com.nara.desktop");
  });
  it("productName is Nara'Korrin", () => {
    expect(config.productName).toBe("Nara'Korrin");
  });
  it("title is Nara'Korrin", () => {
    expect(window.title).toBe("Nara'Korrin");
  });
  it("width is 550", () => {
    expect(window.width).toBe(550);
  });
  it("height is 760", () => {
    expect(window.height).toBe(760);
  });
  it("transparent is true", () => {
    expect(window.transparent).toBe(true);
  });
  it("decorations is false", () => {
    expect(window.decorations).toBe(false);
  });
  it("alwaysOnTop is true", () => {
    expect(window.alwaysOnTop).toBe(true);
  });
  it("skipTaskbar is true", () => {
    expect(window.skipTaskbar).toBe(true);
  });
  it("resizable is false", () => {
    expect(window.resizable).toBe(false);
  });
  it("fullscreen is false", () => {
    expect(window.fullscreen).toBe(false);
  });
});
