export const AVATAR_EMOJI: Record<string, string> = {
  fox: "🦊",
  owl: "🦉",
  cat: "🐱",
  dog: "🐶",
  bear: "🐻",
  rabbit: "🐰",
};

export function emojiFor(avatarId: string): string {
  return AVATAR_EMOJI[avatarId] ?? "🙂";
}

/**
 * Renders a row of clickable avatar buttons into `container`.
 *
 * The actual DOM insertion is deferred to a macrotask on purpose: dynamic
 * content built synchronously inside a click event handler was observed to
 * be silently dropped in a real user's browser (confirmed via manual testing
 * — the identical insertion done directly from the console, outside any
 * event handler, persisted fine; done inside a button's click handler, it
 * consistently ended up empty with no console error). Deferring escapes the
 * click handler's call stack, which sidesteps whatever is doing that.
 */
export function buildAvatarPicker(
  container: HTMLElement,
  selected: string | undefined,
  onSelect: (avatarId: string) => void,
): void {
  setTimeout(() => {
    container.innerHTML = "";
    const avatarIds = Object.keys(AVATAR_EMOJI);
    const initial = selected && avatarIds.includes(selected) ? selected : avatarIds[0];

    for (const avatarId of avatarIds) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "avatar-picker-button" + (avatarId === initial ? " selected" : "");
      button.textContent = AVATAR_EMOJI[avatarId];
      button.title = avatarId;
      button.addEventListener("click", () => {
        container.querySelectorAll(".avatar-picker-button").forEach((b) => b.classList.remove("selected"));
        button.classList.add("selected");
        onSelect(avatarId);
      });
      container.appendChild(button);
    }

    onSelect(initial);
  }, 0);
}
