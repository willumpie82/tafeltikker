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
 * Renders a row of clickable avatar buttons into `container` and returns the
 * currently selected avatarId. Deliberately not a native <select> — some
 * password managers/extensions silently strip dynamically-added <option>s
 * from selects, which broke this form for real users.
 */
export function buildAvatarPicker(
  container: HTMLElement,
  selected: string | undefined,
  onSelect: (avatarId: string) => void,
): void {
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
}
