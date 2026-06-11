import { getCurrentWindow } from "@tauri-apps/api/window";
import { App } from "./components/app";
import "./style.css";

document.addEventListener(
  "mousedown",
  (e) => {
    if (e.button === 0) {
      getCurrentWindow().startDragging();
    }
  },
  { capture: true },
);

const app = new App(document.getElementById("app")!);
app.mount();
