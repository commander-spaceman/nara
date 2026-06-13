export function createResizeHandler(
  container: HTMLElement,
  onResize: (width: number, height: number) => void,
): () => void {
  const observer = new ResizeObserver(([entry]) => {
    if (!entry) return;
    const { width, height } = entry.contentRect;
    if (width > 0 && height > 0) {
      onResize(width, height);
    }
  });

  observer.observe(container);

  return () => observer.disconnect();
}
