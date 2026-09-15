import { showView, setChallengeWidgetRefresh } from "./views.js";
import { startMathSettings } from "./math.js";
import { startTypingSettings } from "./typing.js";
import { emojiFor } from "./avatars.js";
import { refreshChallengeWidget } from "./challenges.js";
import { initGroupGate, showGroupGate } from "./group-gate.js";

setChallengeWidgetRefresh(refreshChallengeWidget);

type Avatar = { id: number; name: string; avatarId: string };

let selectedChild: Avatar | null = null;
let enteredPin = "";

const pinDotsEl = document.getElementById("pin-dots")!;
const pinErrorEl = document.getElementById("pin-error")!;
const pinHeadingEl = document.getElementById("pin-heading")!;
const pinPadEl = document.getElementById("pin-pad")!;

function renderPinDots() {
  const dots = pinDotsEl.querySelectorAll(".dot");
  dots.forEach((dot, i) => dot.classList.toggle("filled", i < enteredPin.length));
}

function resetPin() {
  enteredPin = "";
  pinErrorEl.hidden = true;
  renderPinDots();
}

function renderAvatarGrid(avatars: Avatar[]) {
  const grid = document.getElementById("avatar-grid")!;
  grid.innerHTML = "";
  for (const avatar of avatars) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "avatar-button";
    button.innerHTML = `<span>${emojiFor(avatar.avatarId)}</span><span class="name">${avatar.name}</span>`;
    button.addEventListener("click", () => selectChild(avatar));
    grid.appendChild(button);
  }
}

async function loadAvatars() {
  const res = await fetch("/api/child/avatars");
  renderAvatarGrid(await res.json());
}

function getGroupSlugFromPath(): string | null {
  const [slug] = window.location.pathname.replace(/^\/+/, "").split("/");
  return slug || null;
}

initGroupGate((groupName, avatars) => {
  document.getElementById("avatars-heading")!.textContent = `Welkom bij ${groupName}, klik op je naam om door te gaan`;
  renderAvatarGrid(avatars);
  showView("view-avatars");
});

async function loadGroupAvatarsOrGate(slug: string) {
  const res = await fetch(`/api/group/${slug}/avatars`);
  if (res.status === 404) {
    showView("view-group-not-found");
    return;
  }
  if (!res.ok) {
    showGroupGate(slug);
    return;
  }
  const { groupName, avatars } = await res.json();
  document.getElementById("avatars-heading")!.textContent = `Welkom bij ${groupName}, klik op je naam om door te gaan`;
  renderAvatarGrid(avatars);
  showView("view-avatars");
}

function selectChild(avatar: Avatar) {
  selectedChild = avatar;
  pinHeadingEl.textContent = `Hoi ${avatar.name}, wat is je geheime code?`;
  resetPin();
  showView("view-pin");
}

async function submitPin() {
  if (!selectedChild) return;

  const res = await fetch("/api/child/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ childId: selectedChild.id, pin: enteredPin }),
  });

  if (!res.ok) {
    pinErrorEl.hidden = false;
    resetPin();
    return;
  }

  const child = await res.json();
  document.getElementById("home-greeting")!.textContent = `Hallo, ${child.name}!`;
  showView("view-home");
}

function buildPinPad() {
  pinPadEl.innerHTML = "";
  const layout = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

  for (const key of layout) {
    const button = document.createElement("button");
    button.type = "button";

    if (key === "") {
      button.className = "empty";
      button.disabled = true;
    } else if (key === "back") {
      button.textContent = "⌫";
      button.addEventListener("click", () => {
        enteredPin = enteredPin.slice(0, -1);
        renderPinDots();
      });
    } else {
      button.textContent = key;
      button.addEventListener("click", () => {
        if (enteredPin.length >= 4) return;
        enteredPin += key;
        renderPinDots();
        if (enteredPin.length === 4) submitPin();
      });
    }

    pinPadEl.appendChild(button);
  }
}

document.getElementById("pin-back")!.addEventListener("click", () => {
  selectedChild = null;
  showView("view-avatars");
});

document.getElementById("logout-button")!.addEventListener("click", async () => {
  await fetch("/api/child/logout", { method: "POST" });
  selectedChild = null;
  showView("view-avatars");
  loadAvatars();
});

document.getElementById("parent-icon")!.addEventListener("click", () => {
  window.location.href = "/parent.html";
});

document.getElementById("start-math-button")!.addEventListener("click", () => {
  startMathSettings();
});

document.getElementById("start-typing-button")!.addEventListener("click", () => {
  startTypingSettings();
});

async function init() {
  buildPinPad();

  // An existing child session always wins regardless of slug — child-facing
  // login itself doesn't change per the design doc. A child already logged
  // in who visits a different group's URL still lands on their own home
  // view with no gate check.
  const meRes = await fetch("/api/child/me");
  if (meRes.ok) {
    const child = await meRes.json();
    document.getElementById("home-greeting")!.textContent = `Hallo, ${child.name}!`;
    showView("view-home");
    return;
  }

  const slug = getGroupSlugFromPath();
  if (!slug) {
    await loadAvatars();
    showView("view-avatars");
    return;
  }

  await loadGroupAvatarsOrGate(slug);
}

init();
