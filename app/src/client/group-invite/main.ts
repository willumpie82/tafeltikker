import { buildAvatarPicker, emojiFor } from "../avatars.js";

type Candidate = { id: number; name: string; avatarId: string };
type AcceptBody = { childId?: number; newChild?: { avatarId: string; pin: string }; displayName?: string };

function getToken(): string | null {
  return new URLSearchParams(window.location.search).get("token");
}

const token = getToken();

const loadingEl = document.getElementById("group-invite-loading")!;
const invalidView = document.getElementById("group-invite-view-invalid")!;
const step1View = document.getElementById("group-invite-view-step1")!;
const step2View = document.getElementById("group-invite-view-step2")!;
const successView = document.getElementById("group-invite-view-success")!;

let groupName = "";
let childName = "";
// Carried from the first accept attempt into a collision resubmit — the
// backend needs the same childId/newChild payload again, plus the
// disambiguated displayName this time.
let pendingAccept: AcceptBody = {};

function showStep1() {
  document.getElementById("group-invite-intro")!.textContent =
    `Je bent uitgenodigd voor de groep "${groupName}" als ouder van ${childName}.`;
  step1View.hidden = false;
}

document.querySelectorAll<HTMLButtonElement>(".group-invite-auth-tab").forEach((tabButton) => {
  tabButton.addEventListener("click", () => {
    document.querySelectorAll<HTMLButtonElement>(".group-invite-auth-tab").forEach((btn) => {
      btn.classList.toggle("selected", btn === tabButton);
    });
    const isLogin = tabButton.dataset.authTab === "login";
    document.getElementById("group-invite-login-form")!.hidden = !isLogin;
    document.getElementById("group-invite-register-form")!.hidden = isLogin;
  });
});

document.getElementById("group-invite-login-form")!.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = (document.getElementById("group-invite-login-username") as HTMLInputElement).value;
  const password = (document.getElementById("group-invite-login-password") as HTMLInputElement).value;
  const errorEl = document.getElementById("group-invite-login-error")!;

  const res = await fetch("/api/parent/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    errorEl.hidden = false;
    return;
  }
  errorEl.hidden = true;
  step1View.hidden = true;
  await loadStep2();
});

document.getElementById("group-invite-register-form")!.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = (document.getElementById("group-invite-register-username") as HTMLInputElement).value;
  const password = (document.getElementById("group-invite-register-password") as HTMLInputElement).value;
  const errorEl = document.getElementById("group-invite-register-error")!;

  const res = await fetch(`/api/group-invite/${encodeURIComponent(token ?? "")}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    errorEl.textContent = body.error === "username_taken" ? "Die gebruikersnaam is al in gebruik." : "Er ging iets mis, probeer het opnieuw.";
    errorEl.hidden = false;
    return;
  }
  errorEl.hidden = true;
  step1View.hidden = true;
  await loadStep2();
});

async function loadStep2() {
  document.getElementById("group-invite-child-name-heading")!.textContent = childName;
  step2View.hidden = false;

  const res = await fetch(`/api/group-invite/${encodeURIComponent(token ?? "")}/candidates`);
  if (!res.ok) {
    showStep2Error();
    return;
  }
  const { bestMatch, otherChildren }: { bestMatch: Candidate | null; otherChildren: Candidate[] } = await res.json();

  if (bestMatch) {
    showConfirm(bestMatch, otherChildren);
  } else {
    showPicker(otherChildren);
  }
}

function showStep2Error() {
  const errorEl = document.getElementById("group-invite-step2-error")!;
  errorEl.textContent = "Er ging iets mis, probeer het opnieuw.";
  errorEl.hidden = false;
}

function showConfirm(match: Candidate, otherChildren: Candidate[]) {
  document.getElementById("group-invite-picker")!.hidden = true;
  const confirmEl = document.getElementById("group-invite-confirm")!;
  document.getElementById("group-invite-confirm-avatar")!.textContent = emojiFor(match.avatarId);
  document.getElementById("group-invite-confirm-name")!.textContent = match.name;
  confirmEl.hidden = false;

  document.getElementById("group-invite-confirm-yes")!.onclick = () => acceptChild({ childId: match.id });
  document.getElementById("group-invite-confirm-no")!.onclick = () => {
    confirmEl.hidden = true;
    showPicker(otherChildren);
  };
}

function showPicker(otherChildren: Candidate[]) {
  document.getElementById("group-invite-confirm")!.hidden = true;
  const pickerEl = document.getElementById("group-invite-picker")!;
  document.getElementById("group-invite-picker-child-name")!.textContent = childName;
  const listEl = document.getElementById("group-invite-picker-list")!;
  listEl.innerHTML = "";

  for (const child of otherChildren) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${emojiFor(child.avatarId)} ${child.name}`;
    button.addEventListener("click", () => acceptChild({ childId: child.id }));
    listEl.appendChild(button);
  }

  pickerEl.hidden = false;
}

let newChildAvatarId = "";

document.getElementById("group-invite-add-new-child")!.addEventListener("click", () => {
  document.getElementById("group-invite-picker")!.hidden = true;
  const form = document.getElementById("group-invite-new-child-form") as HTMLFormElement;
  document.getElementById("group-invite-new-child-name")!.textContent = childName;
  form.hidden = false;
  buildAvatarPicker(document.getElementById("group-invite-new-child-avatar-picker")!, undefined, (id) => (newChildAvatarId = id));
});

document.getElementById("group-invite-new-child-form")!.addEventListener("submit", (event) => {
  event.preventDefault();
  const pin = (document.getElementById("group-invite-new-child-pin") as HTMLInputElement).value;
  acceptChild({ newChild: { avatarId: newChildAvatarId, pin } });
});

document.getElementById("group-invite-collision-submit")!.addEventListener("click", () => {
  const displayName = (document.getElementById("group-invite-collision-name") as HTMLInputElement).value;
  acceptChild({ ...pendingAccept, displayName });
});

async function acceptChild(body: AcceptBody) {
  pendingAccept = { childId: body.childId, newChild: body.newChild };

  const res = await fetch(`/api/group-invite/${encodeURIComponent(token ?? "")}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 409) {
    const { suggested } = await res.json();
    document.getElementById("group-invite-confirm")!.hidden = true;
    document.getElementById("group-invite-picker")!.hidden = true;
    (document.getElementById("group-invite-new-child-form") as HTMLFormElement).hidden = true;
    (document.getElementById("group-invite-collision-name") as HTMLInputElement).value = suggested;
    document.getElementById("group-invite-collision")!.hidden = false;
    return;
  }

  if (!res.ok) {
    showStep2Error();
    return;
  }

  document.getElementById("group-invite-collision")!.hidden = true;
  const { groupName: joinedGroupName, childName: joinedChildName } = await res.json();
  step2View.hidden = true;
  document.getElementById("group-invite-success-heading")!.textContent = `${joinedChildName} is toegevoegd aan ${joinedGroupName}`;
  successView.hidden = false;
}

async function init() {
  if (!token) {
    loadingEl.hidden = true;
    invalidView.hidden = false;
    return;
  }

  const res = await fetch(`/api/group-invite/${encodeURIComponent(token)}`);
  const data = await res.json();
  loadingEl.hidden = true;

  if (!data.valid) {
    invalidView.hidden = false;
    return;
  }

  groupName = data.groupName;
  childName = data.childName;

  // An already-logged-in parent (e.g. reopening the link) skips straight
  // to Stap 2 instead of being asked to log in again.
  const meRes = await fetch("/api/parent/me");
  if (meRes.ok) {
    await loadStep2();
  } else {
    showStep1();
  }
}

init();
