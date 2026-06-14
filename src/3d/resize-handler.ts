export function createResizeHandler(
  container: HTMLElement,
  onResize: (width: number, height: number) => void,
): () => void {
  let pending = false;
  let rafId = 0;
  let lastWidth = 0;
  let lastHeight = 0;

  const observer = new ResizeObserver(([entry]) => {
    if (!entry) return;
    const { width, height } = entry.contentRect;
    if (width > 0 && height > 0) {
      lastWidth = width;
      lastHeight = height;
      if (!pending) {
        pending = true;
        rafId = requestAnimationFrame(() => {
          pending = false;
          onResize(lastWidth, lastHeight);
        });
      }
    }
  });

  observer.observe(container);

  return () => {
    cancelAnimationFrame(rafId);
    observer.disconnect();
  };
}
