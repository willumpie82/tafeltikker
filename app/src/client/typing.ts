import { showView } from "./views.js";
import { TYPING_LEVELS, promptsFor, QWERTY_ROWS, type TypingLevel } from "./typing-content.js";
import { setupAutoAdvance } from "./next-button.js";

const COUNT_OPTIONS = [5, 10, 20];
const AUTO_ADVANCE_MS = 1000;
const IDLE_HINT_MS = 3000;

const levelPickerEl = document.getElementById("level-picker")!;
const countPickerEl = document.getElementById("typing-count-picker")!;
const startButtonEl = document.getElementById("typing-start-button") as HTMLButtonElement;

const progressEl = document.getElementById("typing-progress")!;
const promptEl = document.getElementById("typing-prompt")!;
const inputEl = document.getElementById("typing-input") as HTMLInputElement;
const feedbackEl = document.getElementById("typing-feedback")!;
const nextButtonEl = document.getElementById("typing-next-button") as HTMLButtonElement;

const summaryHeadingEl = document.getElementById("typing-summary-heading")!;
const progressBarFillEl = document.getElementById("typing-progress-bar-fill") as HTMLElement;
const exerciseViewEl = document.getElementById("view-typing-exercise") as HTMLElement;
const keyboardEl = document.getElementById("onscreen-keyboard")!;

let selectedLevel: TypingLevel = "letters";
let selectedCount = 10;

let sessionId: number | null = null;
let queue: string[] = [];
let currentIndex = 0;
let startTime = 0;
let answered = false;
let previousTypedLength = 0;
let totalKeystrokes = 0;
let correctKeystrokes = 0;
let idleTimeoutId: number | undefined;

const results: { accuracy: number; wpm: number }[] = [];
const keyButtons = new Map<string, HTMLButtonElement>();

const nextAdvance = setupAutoAdvance(nextButtonEl, AUTO_ADVANCE_MS, () => advanceToNext());

function buildKeyboard() {
  keyboardEl.innerHTML = "";
  keyButtons.clear();

  for (const row of QWERTY_ROWS) {
    const rowEl = document.createElement("div");
    rowEl.className = "keyboard-row";
    for (const key of row) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = key;
      button.className = "key-button";
      button.addEventListener("click", () => typeChar(key));
      rowEl.appendChild(button);
      keyButtons.set(key, button);
    }
    keyboardEl.appendChild(rowEl);
  }

  const bottomRow = document.createElement("div");
  bottomRow.className = "keyboard-row";

  const spaceButton = document.createElement("button");
  spaceButton.type = "button";
  spaceButton.textContent = "␣";
  spaceButton.className = "key-button key-space";
  spaceButton.addEventListener("click", () => typeChar(" "));
  keyButtons.set(" ", spaceButton);
  bottomRow.appendChild(spaceButton);

  const backspaceButton = document.createElement("button");
  backspaceButton.type = "button";
  backspaceButton.textContent = "⌫";
  backspaceButton.className = "key-button key-backspace";
  backspaceButton.addEventListener("click", () => backspaceChar());
  bottomRow.appendChild(backspaceButton);

  keyboardEl.appendChild(bottomRow);
}

buildKeyboard();

function setKeyboardEnabled(enabled: boolean) {
  keyButtons.forEach((button) => (button.disabled = !enabled));
}

function clearKeyHighlight() {
  keyButtons.forEach((button) => button.classList.remove("highlight"));
}

function resetIdleTimer() {
  if (idleTimeoutId !== undefined) window.clearTimeout(idleTimeoutId);
  idleTimeoutId = window.setTimeout(highlightNextKey, IDLE_HINT_MS);
}

function cancelIdleTimer() {
  if (idleTimeoutId !== undefined) {
    window.clearTimeout(idleTimeoutId);
    idleTimeoutId = undefined;
  }
}

function highlightNextKey() {
  const prompt = queue[currentIndex];
  const typed = inputEl.value;
  if (typed.length >= prompt.length) return;
  const nextChar = prompt[typed.length].toLowerCase();
  keyButtons.get(nextChar)?.classList.add("highlight");
}

function typeChar(char: string) {
  if (answered) return;
  const prompt = queue[currentIndex];
  if (inputEl.value.length >= prompt.length) return;
  inputEl.value += char;
  inputEl.focus();
  handleTypedChange();
}

function backspaceChar() {
  if (answered) return;
  inputEl.value = inputEl.value.slice(0, -1);
  inputEl.focus();
  handleTypedChange();
}

function buildLevelPicker() {
  levelPickerEl.innerHTML = "";
  levelPickerEl.style.gridTemplateColumns = "repeat(3, 1fr)";
  for (const level of TYPING_LEVELS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = level.label;
    button.className = "table-button";
    button.classList.toggle("selected", level.id === selectedLevel);
    button.addEventListener("click", () => {
      selectedLevel = level.id;
      levelPickerEl.querySelectorAll(".table-button").forEach((el) => el.classList.remove("selected"));
      button.classList.add("selected");
    });
    levelPickerEl.appendChild(button);
  }
}

function buildCountPicker() {
  countPickerEl.innerHTML = "";
  for (const count of COUNT_OPTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = String(count);
    button.className = "count-button";
    button.classList.toggle("selected", count === selectedCount);
    button.addEventListener("click", () => {
      selectedCount = count;
      countPickerEl.querySelectorAll(".count-button").forEach((el) => el.classList.remove("selected"));
      button.classList.add("selected");
    });
    countPickerEl.appendChild(button);
  }
}

export function startTypingSettings() {
  buildLevelPicker();
  buildCountPicker();
  showView("view-typing-settings");
}

async function startSession() {
  const res = await fetch("/api/child/typing/sessions", { method: "POST" });
  const data = await res.json();
  sessionId = data.sessionId;

  queue = promptsFor(selectedLevel, selectedCount);
  currentIndex = 0;
  results.length = 0;

  showView("view-typing-exercise");
  showPrompt();
}

function renderPrompt(typed: string) {
  const prompt = queue[currentIndex];
  promptEl.innerHTML = prompt
    .split("")
    .map((char, i) => {
      let cls = "char";
      if (i < typed.length) {
        cls += char === typed[i] ? " correct" : " incorrect";
      } else if (i === typed.length) {
        cls += " current";
      }
      return `<span class="${cls}">${char === " " ? "&nbsp;" : char}</span>`;
    })
    .join("");
}

function showPrompt() {
  const prompt = queue[currentIndex];
  progressEl.textContent = `Oefening ${currentIndex + 1} van ${queue.length}`;
  progressBarFillEl.style.width = `${(currentIndex / queue.length) * 100}%`;
  answered = false;
  startTime = 0;
  previousTypedLength = 0;
  totalKeystrokes = 0;
  correctKeystrokes = 0;
  inputEl.value = "";
  inputEl.maxLength = prompt.length;
  inputEl.disabled = false;
  setKeyboardEnabled(true);
  clearKeyHighlight();
  feedbackEl.hidden = true;
  nextButtonEl.hidden = true;
  nextAdvance.cancel();
  renderPrompt("");
  resetIdleTimer();
  inputEl.focus();
}

async function handleTypedChange() {
  if (answered) return;
  if (startTime === 0) startTime = performance.now();

  const typed = inputEl.value;
  const prompt = queue[currentIndex];

  // Track every character actually typed (not just the final result) so a
  // typo that gets backspaced and corrected still counts against accuracy —
  // comparing only the final submitted string always reads 100% otherwise.
  // Length-diff based (not the input event's inputType) so this covers both
  // physical typing and the on-screen keyboard, which calls this directly.
  if (typed.length > previousTypedLength) {
    for (let pos = previousTypedLength; pos < typed.length; pos++) {
      totalKeystrokes++;
      if (typed[pos] === prompt[pos]) correctKeystrokes++;
    }
  }
  previousTypedLength = typed.length;

  renderPrompt(typed);
  clearKeyHighlight();
  resetIdleTimer();

  // auto-continue once it's actually correct; a typo (even at the last
  // character) just stays editable — Backspace still works — until Enter.
  if (typed.length >= prompt.length && typed === prompt) {
    await submitAttempt(typed);
  }
}

inputEl.addEventListener("input", handleTypedChange);

inputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !answered) {
    event.preventDefault();
    submitAttempt(inputEl.value);
  }
});

// Losing focus (e.g. a stray tap on mobile) shouldn't silently break typing.
inputEl.addEventListener("blur", () => {
  window.setTimeout(() => {
    if (!exerciseViewEl.hidden && !answered) inputEl.focus();
  }, 0);
});
promptEl.addEventListener("click", () => inputEl.focus());

async function submitAttempt(typed: string) {
  if (answered || sessionId === null) return;
  answered = true;
  inputEl.disabled = true;
  setKeyboardEnabled(false);
  cancelIdleTimer();
  clearKeyHighlight();

  const elapsedMs = startTime === 0 ? 1 : performance.now() - startTime;
  const prompt = queue[currentIndex];

  const res = await fetch(`/api/child/typing/sessions/${sessionId}/attempts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      level: selectedLevel,
      promptText: prompt,
      typedText: typed,
      elapsedMs,
      totalKeystrokes,
      correctKeystrokes,
    }),
  });
  const result = await res.json();
  results.push(result);

  feedbackEl.hidden = false;
  feedbackEl.textContent = `Nauwkeurigheid: ${result.accuracy}% · ${result.wpm} woorden per minuut`;
  feedbackEl.className = "math-feedback " + (result.accuracy >= 90 ? "correct" : "incorrect");

  nextButtonEl.hidden = false;
  nextAdvance.start();
}

async function finishSession(outcome: { status: "completed" | "aborted"; completedCount: number; score?: number }) {
  if (sessionId === null) return;
  await fetch(`/api/child/typing/sessions/${sessionId}/finish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetCount: queue.length, ...outcome }),
  });
}

async function advanceToNext() {
  currentIndex++;
  if (currentIndex >= queue.length) {
    const avgAccuracy = Math.round(results.reduce((sum, r) => sum + r.accuracy, 0) / results.length);
    const avgWpm = Math.round((results.reduce((sum, r) => sum + r.wpm, 0) / results.length) * 10) / 10;
    await finishSession({ status: "completed", completedCount: results.length, score: avgAccuracy });
    summaryHeadingEl.textContent = `Gemiddeld ${avgAccuracy}% goed, ${avgWpm} woorden per minuut! 🎉`;
    showView("view-typing-summary");
    return;
  }
  showPrompt();
}

document.getElementById("typing-settings-back")!.addEventListener("click", () => {
  showView("view-home");
});

document.getElementById("typing-exercise-back")!.addEventListener("click", async () => {
  if (!window.confirm("Wil je nu al stoppen? Weet je het zeker?")) return;
  nextAdvance.cancel();
  cancelIdleTimer();
  await finishSession({ status: "aborted", completedCount: results.length });
  sessionId = null;
  showView("view-home");
});

document.getElementById("typing-start-button")!.addEventListener("click", () => {
  startSession();
});

document.getElementById("typing-summary-done")!.addEventListener("click", () => {
  showView("view-home");
});
