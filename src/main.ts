import { getCurrentWindow } from "@tauri-apps/api/window";
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
