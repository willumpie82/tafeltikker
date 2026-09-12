// Screens where the persistent challenge-progress widget makes sense —
// deliberately excludes the exercise/summary screens, which stay focused.
const CHALLENGE_WIDGET_VIEWS = new Set(["view-home", "view-math-settings", "view-typing-settings"]);

let onEnterWidgetView: (() => void) | null = null;

/** Registers a callback fired whenever a view where the challenge widget belongs is entered. */
export function setChallengeWidgetRefresh(fn: () => void) {
  onEnterWidgetView = fn;
}

export function showView(id: string) {
  document.querySelectorAll<HTMLElement>(".view").forEach((el) => {
    el.hidden = el.id !== id;
  });

  const widget = document.getElementById("challenge-widget");
  if (widget) {
    const belongs = CHALLENGE_WIDGET_VIEWS.has(id);
    widget.hidden = !belongs;
    if (belongs) onEnterWidgetView?.();
  }
}
