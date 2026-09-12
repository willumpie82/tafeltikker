import { AVATAR_EMOJI, emojiFor } from "../avatars.js";

type Role = "parent" | "user_admin" | "system_admin";
type ParentRow = { id: number; username: string; role: Role; createdAt: string };
type ChildRow = { id: number; name: string; avatarId: string; parentUsernames: string[] };
type FeedbackRow = { id: number; message: string; createdAt: string; parentUsername: string };
type InviteRow = {
  id: number;
  token: string;
  expiresAt: string;
  usedAt: string | null;
  usedByUsername: string | null;
  createdAt: string;
  status: "pending" | "used" | "expired";
};

const ROLE_LABELS: Record<Role, string> = {
  parent: "Ouder",
  user_admin: "Gebruikersbeheer",
  system_admin: "Systeembeheer",
};

let myRole: Role = "parent";

const appEl = document.getElementById("admin-app")!;
const deniedEl = document.getElementById("admin-denied")!;

function populateAvatarSelect(select: HTMLSelectElement, selected?: string) {
  select.innerHTML = "";
  for (const avatarId of Object.keys(AVATAR_EMOJI)) {
    const option = document.createElement("option");
    option.value = avatarId;
    option.textContent = `${AVATAR_EMOJI[avatarId]} ${avatarId}`;
    option.selected = avatarId === selected;
    select.appendChild(option);
  }
}

function showTab(name: string) {
  document.querySelectorAll<HTMLElement>(".admin-tab").forEach((el) => {
    el.hidden = el.id !== `admin-tab-${name}`;
  });
  document.querySelectorAll<HTMLElement>(".tab-button").forEach((el) => {
    el.classList.toggle("selected", el.dataset.tab === name);
  });
}

document.querySelectorAll<HTMLButtonElement>(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.tab!;
    showTab(tab);
    if (tab === "parents") loadParents();
    else if (tab === "children") loadChildren();
    else if (tab === "feedback") loadFeedback();
    else if (tab === "invites") loadInvites();
  });
});

document.getElementById("admin-logout-button")!.addEventListener("click", async () => {
  await fetch("/api/parent/logout", { method: "POST" });
  window.location.href = "/parent.html";
});

async function loadParents() {
  const res = await fetch("/api/admin/parents");
  const list = document.getElementById("parents-list")!;
  list.innerHTML = "";
  if (!res.ok) return;

  const parents: ParentRow[] = await res.json();
  for (const parent of parents) {
    list.appendChild(renderParentRow(parent));
  }
}

function renderParentRow(parent: ParentRow): HTMLElement {
  const row = document.createElement("div");
  row.className = "admin-row";
  row.innerHTML = `
    <div class="admin-row-header">
      <span class="name">${parent.username}</span>
      <span class="role-badge ${parent.role}">${ROLE_LABELS[parent.role]}</span>
    </div>
    <div class="admin-row-meta">Sinds ${new Date(parent.createdAt + "Z").toLocaleDateString("nl-NL")}</div>
    <div class="admin-row-actions"></div>
  `;

  const actions = row.querySelector(".admin-row-actions")!;

  if (myRole === "system_admin" && parent.role !== "system_admin") {
    const select = document.createElement("select");
    for (const role of ["parent", "user_admin"] as const) {
      const option = document.createElement("option");
      option.value = role;
      option.textContent = ROLE_LABELS[role];
      option.selected = role === parent.role;
      select.appendChild(option);
    }
    const saveRoleButton = document.createElement("button");
    saveRoleButton.type = "button";
    saveRoleButton.textContent = "Rol opslaan";
    saveRoleButton.addEventListener("click", async () => {
      await fetch(`/api/admin/parents/${parent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: select.value }),
      });
      await loadParents();
    });
    actions.appendChild(select);
    actions.appendChild(saveRoleButton);
  }

  const passwordInput = document.createElement("input");
  passwordInput.type = "password";
  passwordInput.placeholder = "Nieuw wachtwoord";
  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.textContent = "Reset wachtwoord";
  resetButton.addEventListener("click", async () => {
    if (!passwordInput.value) return;
    const res = await fetch(`/api/admin/parents/${parent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passwordInput.value }),
    });
    if (res.ok) passwordInput.value = "";
  });
  actions.appendChild(passwordInput);
  actions.appendChild(resetButton);

  return row;
}

async function loadChildren() {
  const res = await fetch("/api/admin/children");
  const list = document.getElementById("admin-children-list")!;
  list.innerHTML = "";
  if (!res.ok) return;

  const rows: ChildRow[] = await res.json();
  for (const child of rows) {
    list.appendChild(renderChildRow(child));
  }
}

function renderChildRow(child: ChildRow): HTMLElement {
  const row = document.createElement("div");
  row.className = "admin-row";
  row.innerHTML = `
    <div class="admin-row-header">
      <span>${emojiFor(child.avatarId)}</span>
      <span class="name">${child.name}</span>
      <button type="button" class="child-edit-toggle">Bewerken</button>
    </div>
    <div class="admin-row-meta">Ouder(s): ${child.parentUsernames.join(", ") || "geen"}</div>
  `;

  const editToggle = row.querySelector(".child-edit-toggle")!;
  let editForm: HTMLFormElement | null = null;

  editToggle.addEventListener("click", () => {
    if (editForm) {
      editForm.remove();
      editForm = null;
      return;
    }

    editForm = document.createElement("form");
    editForm.className = "edit-form";
    editForm.innerHTML = `
      <label>Naam <input type="text" name="name" value="${child.name}" required /></label>
      <label>Avatar <select name="avatarId"></select></label>
      <label>Nieuwe geheime code <input type="text" name="pin" inputmode="numeric" pattern="\\d{4}" maxlength="4" />
        <small>Laat leeg om de code niet te wijzigen.</small>
      </label>
      <div class="form-actions"><button type="submit">Opslaan</button></div>
      <p class="error-text" hidden></p>
    `;
    populateAvatarSelect(editForm.querySelector("select[name=avatarId]")!, child.avatarId);

    editForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(editForm!);
      const body: Record<string, string> = {
        name: String(data.get("name") ?? ""),
        avatarId: String(data.get("avatarId") ?? ""),
      };
      const pin = String(data.get("pin") ?? "");
      if (pin) body.pin = pin;

      const res = await fetch(`/api/admin/children/${child.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const errorEl = editForm!.querySelector(".error-text") as HTMLElement;
      if (!res.ok) {
        errorEl.textContent = "Er ging iets mis bij het opslaan.";
        errorEl.hidden = false;
        return;
      }
      await loadChildren();
    });

    row.appendChild(editForm);
  });

  return row;
}

async function loadFeedback() {
  const res = await fetch("/api/admin/feedback");
  const list = document.getElementById("admin-feedback-list")!;
  list.innerHTML = "";
  if (!res.ok) return;

  const rows: FeedbackRow[] = await res.json();
  if (rows.length === 0) {
    list.innerHTML = `<p class="no-data">Nog geen feedback ontvangen.</p>`;
    return;
  }
  for (const row of rows) {
    const el = document.createElement("div");
    el.className = "feedback-item";
    el.innerHTML = `
      <span class="feedback-date">${row.parentUsername} · ${new Date(row.createdAt + "Z").toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" })}</span>
      <span class="feedback-message"></span>
    `;
    el.querySelector(".feedback-message")!.textContent = row.message;
    list.appendChild(el);
  }
}

document.getElementById("invite-form")!.addEventListener("submit", async (event) => {
  event.preventDefault();
  const days = Number((document.getElementById("invite-days") as HTMLInputElement).value) || 7;

  const res = await fetch("/api/admin/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresInDays: days }),
  });
  if (!res.ok) return;

  const { token } = await res.json();
  const url = `${window.location.origin}/register.html?token=${token}`;

  const resultEl = document.getElementById("invite-result")!;
  const urlInput = document.getElementById("invite-url") as HTMLInputElement;
  urlInput.value = url;
  resultEl.hidden = false;

  await loadInvites();
});

async function loadInvites() {
  const res = await fetch("/api/admin/invites");
  const list = document.getElementById("invites-list")!;
  list.innerHTML = "";
  if (!res.ok) return;

  const rows: InviteRow[] = await res.json();
  const statusLabels: Record<InviteRow["status"], string> = { pending: "In afwachting", used: "Gebruikt", expired: "Verlopen" };

  for (const invite of rows) {
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `
      <div class="admin-row-header">
        <span class="name">${new Date(invite.createdAt + "Z").toLocaleDateString("nl-NL")}</span>
        <span class="status-badge ${invite.status}">${statusLabels[invite.status]}</span>
      </div>
      <div class="admin-row-meta">
        Verloopt: ${new Date(invite.expiresAt).toLocaleDateString("nl-NL")}
        ${invite.usedByUsername ? ` · Gebruikt door ${invite.usedByUsername}` : ""}
      </div>
    `;
    list.appendChild(row);
  }
}

async function init() {
  const meRes = await fetch("/api/parent/me");
  if (!meRes.ok) {
    window.location.href = "/parent.html";
    return;
  }

  const me = await meRes.json();
  if (me.role !== "user_admin" && me.role !== "system_admin") {
    deniedEl.hidden = false;
    return;
  }

  myRole = me.role;
  appEl.hidden = false;
  await loadParents();
}

init();
