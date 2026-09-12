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
