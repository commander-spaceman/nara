import { getCurrentWindow } from "@tauri-apps/api/window";
import { App } from "./components/app";
import "./style.css";

document.addEventListener(
  "mousedown",
  (e) => {
    const target = e.target as HTMLElement;
    if (
      e.button === 0 &&
      target.closest("#model-area") &&
      !target.closest("#modal-overlay")
    ) {
      getCurrentWindow().startDragging();
    }
  },
  { capture: true },
);

const app = new App(document.getElementById("app")!);
app.mount();
