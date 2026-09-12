import { emojiFor, buildAvatarPicker } from "../avatars.js";
import { PROMPT_POOLS, type TypingLevel } from "../typing-content.js";

type Child = { id: number; name: string; avatarId: string };
type Stats = {
  time: { totalSeconds: number; todaySeconds: number; weekSeconds: number };
  perTable: { tableNumber: number; total: number; correct: number }[];
  perFact: { tableNumber: number; operandB: number; total: number; correct: number; avgElapsedMs: number | null }[];
  trend: { day: string; total: number; correct: number }[];
  perTypingLevel: { level: string; total: number; avgAccuracy: number; avgWpm: number }[];
  perTypingPrompt: { level: string; promptText: string; total: number; avgAccuracy: number; avgWpm: number }[];
};

/**
 * Combines accuracy and speed into one 0-100 score: a fact answered
 * correctly every time but slowly still shows as shaky, not just "100%".
 * 3s is treated as a confident pace; never penalized below half credit
 * purely for being slow, since getting it right still matters most.
 */
function factConfidence(correct: number, total: number, avgElapsedMs: number | null): number {
  const accuracy = total > 0 ? correct / total : 0;
  const speedFactor = avgElapsedMs ? Math.min(1, Math.max(0.5, 3000 / avgElapsedMs)) : 1;
  return Math.round(accuracy * speedFactor * 100);
}

// Same idea as factConfidence but WPM-based: 20 wpm is treated as a
// confident pace for a young typist, never penalized below half credit
// purely for being slow since accuracy still matters most.
const CONFIDENT_WPM = 20;
function typingConfidence(avgAccuracy: number, avgWpm: number): number {
  const accuracy = avgAccuracy / 100;
  const speedFactor = Math.min(1, Math.max(0.5, avgWpm / CONFIDENT_WPM));
  return Math.round(accuracy * speedFactor * 100);
}

const TYPING_LEVEL_LABELS: Record<string, string> = {
  letters: "Letters",
  words: "Woorden",
  sentences: "Zinnetjes",
};

const FEEDBACK_STATUS_LABELS: Record<string, string> = {
  new: "Nieuw",
  accepted: "Opgepakt",
  need_info: "Meer info nodig",
  planned: "Ingepland",
  fixed: "Opgelost",
  declined: "Afgewezen",
};

const loginView = document.getElementById("parent-view-login")!;
const dashboardView = document.getElementById("parent-view-dashboard")!;

function showLogin() {
  loginView.hidden = false;
  dashboardView.hidden = true;
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} u ${rest} min`;
}

document.getElementById("login-form")!.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = (document.getElementById("login-username") as HTMLInputElement).value;
  const password = (document.getElementById("login-password") as HTMLInputElement).value;
  const errorEl = document.getElementById("login-error")!;

  const res = await fetch("/api/parent/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    errorEl.hidden = false;
    return;
  }

  const me = await res.json();
  errorEl.hidden = true;
  updateAdminLink(me.username, me.role);
  await loadDashboard();
  showDashboard();
});

function updateAdminLink(username: string, role: string) {
  const adminLink = document.getElementById("admin-link") as HTMLAnchorElement;
  adminLink.hidden = role !== "user_admin" && role !== "system_admin";
  document.getElementById("logged-in-as")!.textContent = `Ingelogd als ${username}`;
}

document.getElementById("logout-button")!.addEventListener("click", async () => {
  await fetch("/api/parent/logout", { method: "POST" });
  showLogin();
});

const addChildButton = document.getElementById("add-child-button")!;
const addChildForm = document.getElementById("add-child-form") as HTMLFormElement;
const addChildAvatarPicker = document.getElementById("new-child-avatar-picker")!;
let newChildAvatarId = "";

// Built up front (not inside the button's click handler) — some browser
// setups appear to silently drop DOM insertions made synchronously inside a
// click handler specifically (confirmed the same insertion works fine done
// directly, or done ahead of time).
buildAvatarPicker(addChildAvatarPicker, undefined, (id) => (newChildAvatarId = id));

addChildButton.addEventListener("click", () => {
  addChildForm.hidden = false;
  addChildButton.hidden = true;
});

document.getElementById("cancel-add-child")!.addEventListener("click", () => {
  addChildForm.hidden = true;
  addChildButton.hidden = false;
  addChildForm.reset();
});

addChildForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = (document.getElementById("new-child-name") as HTMLInputElement).value;
  const avatarId = newChildAvatarId;
  const pin = (document.getElementById("new-child-pin") as HTMLInputElement).value;
  const errorEl = document.getElementById("add-child-error")!;

  const res = await fetch("/api/parent/children", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, avatarId, pin }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    errorEl.textContent = body.error === "invalid_request" ? "Vul alle velden goed in (code = 4 cijfers)." : "Er ging iets mis.";
    errorEl.hidden = false;
    return;
  }

  errorEl.hidden = true;
  addChildForm.reset();
  addChildForm.hidden = true;
  addChildButton.hidden = false;
  await loadDashboard();
});

function renderTableAccuracy(perTable: Stats["perTable"], perFact: Stats["perFact"]): string {
  if (perTable.length === 0) {
    return `<p class="no-data">Nog geen sommen geoefend.</p>`;
  }

  const factsByTable = new Map<number, Stats["perFact"]>();
  for (const fact of perFact) {
    const list = factsByTable.get(fact.tableNumber) ?? [];
    list.push(fact);
    factsByTable.set(fact.tableNumber, list);
  }

  return `<div class="table-accuracy-list">${perTable
    .map((row) => {
      const pct = row.total > 0 ? Math.round((row.correct / row.total) * 100) : 0;
      const factsByMultiplier = new Map((factsByTable.get(row.tableNumber) ?? []).map((f) => [f.operandB, f]));

      const factBars = Array.from({ length: 10 }, (_, i) => i + 1)
        .map((multiplier) => {
          const fact = factsByMultiplier.get(multiplier);
          if (!fact) {
            return `<div class="fact-bar fact-bar-empty" title="${row.tableNumber} × ${multiplier}: nog niet geoefend">
              <span class="fact-bar-label">${multiplier}</span>
            </div>`;
          }
          const confidence = factConfidence(fact.correct, fact.total, fact.avgElapsedMs);
          const tier = confidence >= 80 ? "high" : confidence >= 50 ? "medium" : "low";
          const avgSeconds = fact.avgElapsedMs ? (fact.avgElapsedMs / 1000).toFixed(1) : "?";
          return `<div class="fact-bar" title="${row.tableNumber} × ${multiplier}: ${fact.correct}/${fact.total} goed, gem. ${avgSeconds}s">
            <div class="fact-bar-fill ${tier}" style="height:${confidence}%"></div>
            <span class="fact-bar-label">${multiplier}</span>
          </div>`;
        })
        .join("");

      return `<div class="table-accuracy-row">
        <div class="table-accuracy-summary">
          <span>Tafel ${row.tableNumber}: ${row.correct}/${row.total} (${pct}%)</span>
          <button type="button" class="table-facts-toggle" data-table="${row.tableNumber}">meer &darr;</button>
        </div>
        <div class="accuracy-bar"><div class="accuracy-bar-fill" style="width:${pct}%"></div></div>
        <div class="table-facts-detail" data-table-detail="${row.tableNumber}" hidden>
          <div class="fact-bar-row">${factBars}</div>
        </div>
      </div>`;
    })
    .join("")}</div>`;
}

function renderTrend(trend: Stats["trend"]): string {
  if (trend.length === 0) {
    return `<p class="no-data">Nog geen activiteit deze week.</p>`;
  }
  return `<div class="trend-row">${trend
    .map((row) => {
      const pct = row.total > 0 ? Math.round((row.correct / row.total) * 100) : 0;
      const label = row.day.slice(5).replace("-", "/");
      return `<div class="trend-bar" style="height:${Math.max(pct, 4)}%" title="${row.day}: ${pct}% (${row.correct}/${row.total})">
        <span class="trend-bar-label">${label}</span>
      </div>`;
    })
    .join("")}</div>`;
}

function renderTypingLevels(perTypingLevel: Stats["perTypingLevel"], perTypingPrompt: Stats["perTypingPrompt"]): string {
  if (perTypingLevel.length === 0) {
    return `<p class="no-data">Nog geen typen geoefend.</p>`;
  }

  const promptsByLevel = new Map<string, Stats["perTypingPrompt"]>();
  for (const row of perTypingPrompt) {
    const list = promptsByLevel.get(row.level) ?? [];
    list.push(row);
    promptsByLevel.set(row.level, list);
  }

  return `<div class="table-accuracy-list">${perTypingLevel
    .map((row) => {
      const label = TYPING_LEVEL_LABELS[row.level] ?? row.level;
      const statsByPrompt = new Map((promptsByLevel.get(row.level) ?? []).map((p) => [p.promptText, p]));
      const pool = PROMPT_POOLS[row.level as TypingLevel] ?? [];

      const promptBars = pool
        .map((promptText) => {
          const stat = statsByPrompt.get(promptText);
          const shortLabel = promptText.length > 3 ? promptText.slice(0, 3) : promptText;
          if (!stat) {
            return `<div class="fact-bar fact-bar-empty" title="${promptText}: nog niet geoefend">
              <span class="fact-bar-label">${shortLabel}</span>
            </div>`;
          }
          const confidence = typingConfidence(stat.avgAccuracy, stat.avgWpm);
          const tier = confidence >= 80 ? "high" : confidence >= 50 ? "medium" : "low";
          return `<div class="fact-bar" title="${promptText}: ${stat.avgAccuracy}% nauwkeurig, ${stat.avgWpm} wpm (${stat.total}x)">
            <div class="fact-bar-fill ${tier}" style="height:${confidence}%"></div>
            <span class="fact-bar-label">${shortLabel}</span>
          </div>`;
        })
        .join("");

      return `<div class="table-accuracy-row">
        <div class="table-accuracy-summary">
          <span>${label}: ${row.avgAccuracy}% nauwkeurig, ${row.avgWpm} wpm (${row.total}x)</span>
          <button type="button" class="table-facts-toggle" data-table="level-${row.level}">meer &darr;</button>
        </div>
        <div class="accuracy-bar"><div class="accuracy-bar-fill" style="width:${row.avgAccuracy}%"></div></div>
        <div class="table-facts-detail" data-table-detail="level-${row.level}" hidden>
          <div class="fact-bar-row prompt-bar-row">${promptBars}</div>
        </div>
      </div>`;
    })
    .join("")}</div>`;
}

async function loadChildStats(childId: number): Promise<Stats> {
  const res = await fetch(`/api/parent/children/${childId}/stats`);
  return res.json();
}

function buildEditForm(child: Child, onSaved: () => void): HTMLFormElement {
  const form = document.createElement("form");
  form.className = "edit-form";
  form.innerHTML = `
    <label>Naam <input type="text" name="name" value="${child.name}" required /></label>
    <label>Avatar <div class="avatar-picker" data-avatar-picker></div></label>
    <label>Nieuwe geheime code <input type="text" name="pin" inputmode="numeric" pattern="\\d{4}" maxlength="4" />
      <small>Laat leeg om de code niet te wijzigen.</small>
    </label>
    <div class="form-actions">
      <button type="submit">Opslaan</button>
    </div>
    <p class="error-text" hidden></p>
  `;
  let selectedAvatarId = child.avatarId;
  buildAvatarPicker(form.querySelector("[data-avatar-picker]")!, child.avatarId, (id) => (selectedAvatarId = id));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const body: Record<string, string> = {
      name: String(data.get("name") ?? ""),
      avatarId: selectedAvatarId,
    };
    const pin = String(data.get("pin") ?? "");
    if (pin) body.pin = pin;

    const res = await fetch(`/api/parent/children/${child.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const errorEl = form.querySelector(".error-text") as HTMLElement;
    if (!res.ok) {
      errorEl.textContent = "Er ging iets mis bij het opslaan.";
      errorEl.hidden = false;
      return;
    }

    onSaved();
  });

  return form;
}

async function renderChildCard(child: Child): Promise<HTMLElement> {
  const stats = await loadChildStats(child.id);
  const card = document.createElement("div");
  card.className = "child-card";

  card.innerHTML = `
    <div class="child-card-header">
      <span class="avatar">${emojiFor(child.avatarId)}</span>
      <span class="name">${child.name}</span>
      <button type="button" class="child-edit-toggle">Bewerken</button>
    </div>
    <div class="stat-row">
      <span>Vandaag: <strong>${formatDuration(stats.time.todaySeconds)}</strong></span>
      <span>Deze week: <strong>${formatDuration(stats.time.weekSeconds)}</strong></span>
      <span>Totaal: <strong>${formatDuration(stats.time.totalSeconds)}</strong></span>
    </div>
    <h3>Sommen</h3>
    ${renderTableAccuracy(stats.perTable, stats.perFact)}
    ${renderTrend(stats.trend)}
    <h3>Typen</h3>
    ${renderTypingLevels(stats.perTypingLevel, stats.perTypingPrompt)}
  `;

  // Toggling only shows/hides bars already rendered above — no new DOM
  // insertion happens in this click handler.
  card.querySelectorAll<HTMLButtonElement>(".table-facts-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const detail = card.querySelector<HTMLElement>(`[data-table-detail="${button.dataset.table}"]`)!;
      detail.hidden = !detail.hidden;
      button.innerHTML = detail.hidden ? "meer &darr;" : "minder &uarr;";
    });
  });

  const editToggle = card.querySelector(".child-edit-toggle")!;
  let editForm: HTMLFormElement | null = null;
  editToggle.addEventListener("click", () => {
    if (editForm) {
      editForm.remove();
      editForm = null;
      return;
    }
    editForm = buildEditForm(child, () => loadDashboard());
    card.appendChild(editForm);
  });

  return card;
}

async function loadDashboard() {
  const res = await fetch("/api/parent/children");
  const list = document.getElementById("children-list")!;
  list.innerHTML = "";

  if (!res.ok) return;

  const children: Child[] = await res.json();
  for (const child of children) {
    list.appendChild(await renderChildCard(child));
  }
}

function formatFeedbackDate(createdAt: string): string {
  return new Date(createdAt + "Z").toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" });
}

async function loadFeedback() {
  const res = await fetch("/api/parent/feedback");
  const list = document.getElementById("feedback-list")!;
  list.innerHTML = "";

  if (!res.ok) return;

  const items: { id: number; message: string; status: string; response: string | null; createdAt: string }[] = await res.json();
  for (const item of items) {
    const el = document.createElement("div");
    el.className = "feedback-item";
    el.innerHTML = `
      <span class="feedback-date">${formatFeedbackDate(item.createdAt)}</span>
      <span class="status-badge ${item.status}">${FEEDBACK_STATUS_LABELS[item.status] ?? item.status}</span>
      <span class="feedback-message"></span>
      ${item.response ? `<p class="feedback-response"></p>` : ""}
    `;
    el.querySelector(".feedback-message")!.textContent = item.message;
    if (item.response) el.querySelector(".feedback-response")!.textContent = `Reactie: ${item.response}`;
    list.appendChild(el);
  }
}

document.getElementById("feedback-form")!.addEventListener("submit", async (event) => {
  event.preventDefault();
  const textarea = document.getElementById("feedback-message") as HTMLTextAreaElement;
  const errorEl = document.getElementById("feedback-error")!;

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

async function init() {
  const meRes = await fetch("/api/parent/me");
  if (meRes.ok) {
    const me = await meRes.json();
    updateAdminLink(me.username, me.role);
    await loadDashboard();
    await loadFeedback();
    showDashboard();
  } else {
    showLogin();
  }
}

init();
