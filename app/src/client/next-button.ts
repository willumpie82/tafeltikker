export function setupAutoAdvance(button: HTMLButtonElement, durationMs: number, onAdvance: () => void) {
  const fill = button.querySelector<HTMLElement>(".next-fill");
  let timeoutId: number | undefined;
  let fired = false;

  function cancel() {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  }

  function advanceOnce() {
    if (fired) return;
    fired = true;
    cancel();
    onAdvance();
  }

  function start() {
    fired = false;
    cancel();
    if (fill) {
      fill.style.transition = "none";
      fill.style.width = "0%";
      void fill.offsetWidth;
      fill.style.transition = `width ${durationMs}ms linear`;
      fill.style.width = "100%";
    }
    timeoutId = window.setTimeout(advanceOnce, durationMs);
  }

  button.addEventListener("click", advanceOnce);

  return { start, cancel };
}
