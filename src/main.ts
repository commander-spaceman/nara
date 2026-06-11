import { getCurrentWindow } from "@tauri-apps/api/window";
import "./style.css";

document.addEventListener("mousedown", (e) => {
  if (e.target instanceof HTMLElement && e.target.closest("#app")) {
    e.preventDefault();
    getCurrentWindow().startDragging();
  }
});
