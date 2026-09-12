import { emojiFor, buildAvatarPicker } from "../avatars.js";

type Role = "parent" | "user_admin" | "system_admin";
type ParentRow = { id: number; username: string; role: Role; createdAt: string };
type ChildRow = { id: number; name: string; avatarId: string; parentUsernames: string[]; parentIds: number[] };
type FeedbackStatus = "new" | "accepted" | "need_info" | "planned" | "fixed" | "declined";
type FeedbackRow = {
  id: number;
  message: string;
  status: FeedbackStatus;
  response: string | null;
  createdAt: string;
  parentUsername: string;
};
type InviteRow = {
  id: number;
  token: string;
  url: string;
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

const adminAddChildButton = document.getElementById("admin-add-child-button")!;
const adminAddChildForm = document.getElementById("admin-add-child-form") as HTMLFormElement;
const adminNewChildAvatarPicker = document.getElementById("admin-new-child-avatar-picker")!;
const adminNewChildParentsEl = document.getElementById("admin-new-child-parents")!;
let adminNewChildAvatarId = "";

// Built once up front rather than reactively on click — see buildAvatarPicker's
// own comment for why: DOM insertion inside a click handler was silently
// dropped for a real user, while the identical work done ahead of time or
// deferred via setTimeout was not.
buildAvatarPicker(adminNewChildAvatarPicker, undefined, (id) => (adminNewChildAvatarId = id));

let cachedParentRows: ParentRow[] = [];

// Same defer-past-the-click-handler pattern as buildAvatarPicker, for the
// same reason — this is also a loop of elements appended one-by-one.
function buildParentCheckboxes(container: HTMLElement, selectedIds: number[]) {
  setTimeout(() => {
    container.innerHTML = "";
    for (const parent of cachedParentRows) {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = String(parent.id);
      checkbox.checked = selectedIds.includes(parent.id);
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(parent.username));
      container.appendChild(label);
    }
  }, 0);
}

async function loadParentCheckboxes() {
  const res = await fetch("/api/admin/parents");
  if (!res.ok) return;
  cachedParentRows = await res.json();
  buildParentCheckboxes(adminNewChildParentsEl, []);
}

adminAddChildButton.addEventListener("click", () => {
  adminAddChildForm.hidden = false;
  adminAddChildButton.hidden = true;
});

document.getElementById("admin-cancel-add-child")!.addEventListener("click", () => {
  adminAddChildForm.hidden = true;
  adminAddChildButton.hidden = false;
  adminAddChildForm.reset();
});

adminAddChildForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = (document.getElementById("admin-new-child-name") as HTMLInputElement).value;
  const pin = (document.getElementById("admin-new-child-pin") as HTMLInputElement).value;
  const parentIds = [...adminNewChildParentsEl.querySelectorAll<HTMLInputElement>("input[type=checkbox]:checked")].map((el) =>
    Number(el.value),
  );
  const errorEl = document.getElementById("admin-add-child-error")!;

  const res = await fetch("/api/admin/children", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, avatarId: adminNewChildAvatarId, pin, parentIds }),
  });

  if (!res.ok) {
    errorEl.textContent = "Vul alle velden goed in en kies minstens één ouder.";
    errorEl.hidden = false;
    return;
  }

  errorEl.hidden = true;
  adminAddChildForm.reset();
  adminAddChildForm.hidden = true;
  adminAddChildButton.hidden = false;
  await loadChildren();
});

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
      <label>Avatar <div class="avatar-picker" data-avatar-picker></div></label>
      <label>Nieuwe geheime code <input type="text" name="pin" inputmode="numeric" pattern="\\d{4}" maxlength="4" />
        <small>Laat leeg om de code niet te wijzigen.</small>
      </label>
      <label>Ouder(s) <div class="parent-checkboxes" data-parent-checkboxes></div></label>
      <div class="form-actions"><button type="submit">Opslaan</button></div>
      <p class="error-text" hidden></p>
    `;
    let selectedAvatarId = child.avatarId;
    buildAvatarPicker(editForm.querySelector("[data-avatar-picker]")!, child.avatarId, (id) => (selectedAvatarId = id));
    buildParentCheckboxes(editForm.querySelector("[data-parent-checkboxes]")!, child.parentIds);

    editForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(editForm!);
      const parentIds = [...editForm!.querySelectorAll<HTMLInputElement>("[data-parent-checkboxes] input:checked")].map((el) =>
        Number(el.value),
      );
      const body: Record<string, unknown> = {
        name: String(data.get("name") ?? ""),
        avatarId: selectedAvatarId,
        parentIds,
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

const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "Nieuw",
  accepted: "Opgepakt",
  need_info: "Meer info nodig",
  planned: "Ingepland",
  fixed: "Opgelost",
  declined: "Afgewezen",
};

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
    // Options are static, baked directly into this one innerHTML assignment
    // (not appended one-by-one afterward) — the safe pattern per the avatar
    // picker fix, which was specifically about elements appended in a loop
    // from inside a click handler.
    el.innerHTML = `
      <span class="feedback-date">${row.parentUsername} · ${new Date(row.createdAt + "Z").toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" })}</span>
      <span class="status-badge ${row.status}">${FEEDBACK_STATUS_LABELS[row.status]}</span>
      <span class="feedback-message"></span>
      <div class="feedback-admin-controls">
        <select class="feedback-status-select">
          <option value="new">Nieuw</option>
          <option value="accepted">Opgepakt</option>
          <option value="need_info">Meer info nodig</option>
          <option value="planned">Ingepland</option>
          <option value="fixed">Opgelost</option>
          <option value="declined">Afgewezen</option>
        </select>
        <input type="text" class="feedback-response-input" placeholder="Reactie (optioneel)" />
        <button type="button" class="feedback-save-button">Opslaan</button>
      </div>
    `;
    el.querySelector(".feedback-message")!.textContent = row.message;

    const statusSelect = el.querySelector(".feedback-status-select") as HTMLSelectElement;
    statusSelect.value = row.status;
    const responseInput = el.querySelector(".feedback-response-input") as HTMLInputElement;
    responseInput.value = row.response ?? "";

    el.querySelector(".feedback-save-button")!.addEventListener("click", async () => {
      await fetch(`/api/admin/feedback/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: statusSelect.value, response: responseInput.value }),
      });
      await loadFeedback();
    });

    list.appendChild(el);
  }
}

document.getElementById("admin-feedback-form")!.addEventListener("submit", async (event) => {
  event.preventDefault();
  const textarea = document.getElementById("admin-feedback-message") as HTMLTextAreaElement;
  const errorEl = document.getElementById("admin-feedback-error")!;

  const res = await fetch("/api/parent/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: textarea.value }),
  });

  if (!res.ok) {
    errorEl.textContent = "Er ging iets mis bij het versturen.";
    errorEl.hidden = false;
    return;
  }

  errorEl.hidden = true;
  textarea.value = "";
  await loadFeedback();
});

async function generateInvite(days: number): Promise<string | null> {
  const res = await fetch("/api/admin/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresInDays: days }),
  });
  if (!res.ok) return null;
  const { url } = await res.json();
  return url;
}

document.getElementById("invite-form")!.addEventListener("submit", async (event) => {
  event.preventDefault();
  const days = Number((document.getElementById("invite-days") as HTMLInputElement).value) || 7;

  const url = await generateInvite(days);
  if (!url) return;

  const resultEl = document.getElementById("invite-result")!;
  const urlInput = document.getElementById("invite-url") as HTMLInputElement;
  urlInput.value = url;
  resultEl.hidden = false;

  await loadInvites();
});

document.getElementById("quick-invite-button")!.addEventListener("click", async () => {
  const url = await generateInvite(7);
  if (!url) return;

  const resultEl = document.getElementById("quick-invite-result")!;
  const urlInput = document.getElementById("quick-invite-url") as HTMLInputElement;
  urlInput.value = url;
  resultEl.hidden = false;
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
      ${invite.status === "pending" ? `<input type="text" readonly value="${invite.url}" class="invite-row-url" />` : ""}
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
  document.getElementById("logged-in-as")!.textContent = `Ingelogd als ${me.username}`;
  appEl.hidden = false;
  await loadParents();
  await loadParentCheckboxes();
}

init();
