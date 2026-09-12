export type Sticker = { id: string; icon: string; label: string };

// Fixed preset list — the parent picks one as the promised reward when
// creating a challenge, not a custom upload or something the child chooses.
export const STICKERS: Sticker[] = [
  { id: "award_bronze", icon: "🥉", label: "Brons" },
  { id: "award_silver", icon: "🥈", label: "Zilver" },
  { id: "award_gold", icon: "🥇", label: "Goud" },
  { id: "youtube", icon: "▶️", label: "YouTube kijken" },
  { id: "gaming", icon: "🎮", label: "Gamen" },
  { id: "candy", icon: "🍬", label: "Snoep" },
  { id: "cookie", icon: "🍪", label: "Koekje" },
];

export function stickerFor(id: string): Sticker {
  return STICKERS.find((s) => s.id === id) ?? { id, icon: "🏅", label: id };
}
