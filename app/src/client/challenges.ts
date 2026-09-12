import { stickerFor } from "./stickers.js";

type Challenge = {
  id: number;
  type: "time_played" | "table_confidence";
  stickerId: string;
  targetMinutes: number | null;
  countsMath: boolean | null;
  countsTyping: boolean | null;
  targetConfidence: number | null;
  tableNumbers?: number[];
  progress: number;
  target: number;
  completedAt: string | null;
};

const widgetEl = document.getElementById("challenge-widget")!;

function describeChallenge(challenge: Challenge): string {
  const done = Boolean(challenge.completedAt);

  if (challenge.type === "time_played") {
    const modules = challenge.countsMath && challenge.countsTyping ? "Sommen en Typen" : challenge.countsMath ? "Sommen" : "Typen";
    return done
      ? `Je hebt ${challenge.target} minuten ${modules} gespeeld!`
      : `Speel in totaal ${challenge.target} minuten ${modules} — je hebt al ${challenge.progress} minuten gespeeld.`;
  }

  const tables = (challenge.tableNumbers ?? []).join(", ");
  const plural = (challenge.tableNumbers ?? []).length > 1 ? "tafels" : "tafel";
  return done
    ? `Je kent ${plural} ${tables} nu heel goed!`
    : `Word ${challenge.target}% zeker van ${plural} ${tables} — je zit nu op ${challenge.progress}%.`;
}

function renderChip(challenge: Challenge): string {
  const sticker = stickerFor(challenge.stickerId);
  const done = Boolean(challenge.completedAt);
  const pct = challenge.target > 0 ? Math.min(100, Math.round((challenge.progress / challenge.target) * 100)) : 0;
  const unit = challenge.type === "time_played" ? "min" : "%";
  const label = done ? "Behaald! 🎉" : `${challenge.progress}/${challenge.target} ${unit}`;
  const description = describeChallenge(challenge);
  const rewardLine = done ? `Je hebt gewonnen: ${sticker.icon} ${sticker.label}` : `Beloning: ${sticker.icon} ${sticker.label}`;

  return `<div class="challenge-chip ${done ? "done" : ""}" title="${description}">
    <span class="challenge-chip-icon">${sticker.icon}</span>
    <div class="challenge-chip-bar"><div class="challenge-chip-fill" style="width:${done ? 100 : pct}%"></div></div>
    <span class="challenge-chip-label">${label}</span>
    <div class="challenge-chip-detail" hidden>
      <p>${description}</p>
      <p class="challenge-chip-reward">${rewardLine}</p>
    </div>
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

  // Tapping a chip toggles its own detail panel (already baked into the
  // markup above, just hidden) and closes any other open one — no new DOM
  // is created here, so this doesn't need the setTimeout-defer trick
  // buildAvatarPicker uses for reactive DOM insertion.
  widgetEl.querySelectorAll<HTMLElement>(".challenge-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const detail = chip.querySelector<HTMLElement>(".challenge-chip-detail")!;
      const willOpen = detail.hidden;
      widgetEl.querySelectorAll<HTMLElement>(".challenge-chip-detail").forEach((d) => (d.hidden = true));
      detail.hidden = !willOpen;
    });
  });
}
