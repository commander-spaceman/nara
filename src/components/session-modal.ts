import { listSessions, loadSession } from "../modules/memory";
import type { Message } from "../modules/llm";

interface SessionModalCallbacks {
  onSessionLoad: (messages: Message[]) => void;
}

export class SessionModal {
  private container: HTMLElement;
  private callbacks: SessionModalCallbacks;

  constructor(container: HTMLElement, callbacks: SessionModalCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  mount(): void {
    this.hide();
  }

  async show(): Promise<void> {
    try {
      const sessions = await listSessions(0);
      const content = this.container.querySelector(
        "#modal-content",
      ) as HTMLElement;
      const overlay = this.container;

      if (sessions.length === 0) {
        content.innerHTML =
          '<div style="color:var(--text-dim);text-align:center;padding:16px">no past sessions</div>';
      } else {
        content.innerHTML = sessions
          .map((s) => {
            const d = new Date(s.started_at * 1000).toLocaleString();
            return `
            <div class="modal-session" data-session-id="${s.id}">
              <span class="modal-session-id">${s.id.slice(0, 10)}</span>
              <span class="modal-session-date">${d}</span>
              <span class="modal-session-count">${s.msg_count} msgs</span>
            </div>`;
          })
          .join("");

        content.querySelectorAll(".modal-session").forEach((el) => {
          el.addEventListener("click", async () => {
            const id = (el as HTMLElement).dataset.sessionId!;
            const msgs = await loadSession(id);
            if (msgs.length > 0) {
              this.callbacks.onSessionLoad(
                msgs.map((m) => ({
                  role: m.role as "user" | "assistant",
                  content: m.content,
                })),
              );
            }
            this.hide();
          });
        });
      }

      overlay.classList.remove("hidden");

      const close = this.container.querySelector("#modal-close") as HTMLElement;
      close.onclick = () => this.hide();
      overlay.onclick = (e) => {
        if (e.target === overlay) this.hide();
      };
      document.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Escape") this.hide();
        },
        { once: true },
      );
    } catch {
      // silently fail — subtitle handles feedback
    }
  }

  hide(): void {
    this.container.classList.add("hidden");
    const content = this.container.querySelector(
      "#modal-content",
    ) as HTMLElement;
    content.innerHTML = "";
  }
}
