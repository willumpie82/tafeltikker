import { stickerFor } from "./stickers.js";

type Challenge = {
  id: number;
  type: "time_played" | "table_confidence";
  stickerId: string;
  progress: number;
  target: number;
  completedAt: string | null;
};

const widgetEl = document.getElementById("challenge-widget")!;

function renderChip(challenge: Challenge): string {
  const sticker = stickerFor(challenge.stickerId);
  const done = Boolean(challenge.completedAt);
  const pct = challenge.target > 0 ? Math.min(100, Math.round((challenge.progress / challenge.target) * 100)) : 0;
  const unit = challenge.type === "time_played" ? "min" : "%";
  const label = done ? "Behaald! 🎉" : `${challenge.progress}/${challenge.target} ${unit}`;

  return `<div class="challenge-chip ${done ? "done" : ""}" title="${sticker.label}">
    <span class="challenge-chip-icon">${sticker.icon}</span>
    <div class="challenge-chip-bar"><div class="challenge-chip-fill" style="width:${done ? 100 : pct}%"></div></div>
    <span class="challenge-chip-label">${label}</span>
  </div>`;
}

export async function refreshChallengeWidget() {
  const res = await fetch("/api/child/challenges");
  if (!res.ok) {
    widgetEl.innerHTML = "";
    widgetEl.classList.add("empty");
    return;
  }
  const challenges: Challenge[] = await res.json();
  widgetEl.classList.toggle("empty", challenges.length === 0);
  widgetEl.innerHTML = challenges.map(renderChip).join("");
}
