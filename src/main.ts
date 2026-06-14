import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { App } from "./components/app";
import "./style.css";

const app = new App(document.getElementById("app")!);

document.addEventListener(
  "mousedown",
  (e) => {
    const target = e.target as HTMLElement;
    if (
      e.button === 0 &&
      target.closest("#model-area") &&
      !target.closest(".modal-overlay")
    ) {
      getCurrentWindow().startDragging();
    }
  },
  { capture: true },
);

listen<string>("background-theme", (event) => {
  document.documentElement.setAttribute("data-theme", event.payload);
  app.setTheme(event.payload);
});

app.mount();
