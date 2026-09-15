import { showView } from "./views.js";

type Avatar = { id: number; name: string; avatarId: string };

let currentSlug = "";
let onUnlocked: ((avatars: Avatar[]) => void) | null = null;

/** Registers what happens once either gate path succeeds — main.ts renders the roster. */
export function initGroupGate(onUnlockedCallback: (avatars: Avatar[]) => void) {
  onUnlocked = onUnlockedCallback;
}

export function showGroupGate(slug: string) {
  currentSlug = slug;

  (document.getElementById("group-gate-secret-input") as HTMLInputElement).value = "";
  (document.getElementById("group-gate-secret-remember") as HTMLInputElement).checked = false;
  document.getElementById("group-gate-secret-error")!.hidden = true;

  (document.getElementById("group-gate-parent-username") as HTMLInputElement).value = "";
  (document.getElementById("group-gate-parent-password") as HTMLInputElement).value = "";
  (document.getElementById("group-gate-parent-remember") as HTMLInputElement).checked = false;
  document.getElementById("group-gate-parent-error")!.hidden = true;

  showView("view-group-gate");
}

document.getElementById("group-gate-secret-form")!.addEventListener("submit", async (event) => {
  event.preventDefault();
  const secret = (document.getElementById("group-gate-secret-input") as HTMLInputElement).value;
  const remember = (document.getElementById("group-gate-secret-remember") as HTMLInputElement).checked;
  const errorEl = document.getElementById("group-gate-secret-error")!;

  const res = await fetch(`/api/group/${currentSlug}/secret-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, remember }),
  });

  if (!res.ok) {
    errorEl.hidden = false;
    return;
  }

  errorEl.hidden = true;
  onUnlocked?.(await res.json());
});

document.getElementById("group-gate-parent-form")!.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = (document.getElementById("group-gate-parent-username") as HTMLInputElement).value;
  const password = (document.getElementById("group-gate-parent-password") as HTMLInputElement).value;
  const remember = (document.getElementById("group-gate-parent-remember") as HTMLInputElement).checked;
  const errorEl = document.getElementById("group-gate-parent-error")!;

  const res = await fetch(`/api/group/${currentSlug}/parent-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, remember }),
  });

  if (!res.ok) {
    // Same text for invalid credentials and valid-credentials-but-no-
    // child-in-group — the backend already unifies both into one error
    // code, so there's nothing to branch on here either.
    errorEl.textContent = "Geen kind in deze groep.";
    errorEl.hidden = false;
    return;
  }

  errorEl.hidden = true;
  onUnlocked?.(await res.json());
});
