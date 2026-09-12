import { showView } from "./views.js";

type Question = { tableNumber: number; operandA: number; operandB: number };

const COUNT_OPTIONS = [5, 10, 20];

const selectedTables = new Set<number>();
let selectedCount = 10;
let hintsEnabled = false;

const tablePickerEl = document.getElementById("table-picker")!;
const countPickerEl = document.getElementById("count-picker")!;
const hintsToggleEl = document.getElementById("hints-toggle") as HTMLInputElement;
const startButtonEl = document.getElementById("math-start-button") as HTMLButtonElement;

const progressEl = document.getElementById("math-progress")!;
const questionEl = document.getElementById("math-question")!;
const hintButtonEl = document.getElementById("hint-button")!;
const hintPanelEl = document.getElementById("hint-panel")!;
const answerDisplayEl = document.getElementById("math-answer-display")!;
const feedbackEl = document.getElementById("math-feedback")!;
const mathPadEl = document.getElementById("math-pad")!;
const nextButtonEl = document.getElementById("math-next-button") as HTMLButtonElement;

const summaryHeadingEl = document.getElementById("math-summary-heading")!;

let sessionId: number | null = null;
let queue: Question[] = [];
let currentIndex = 0;
let currentAnswer = "";
let answered = false;
let hintUsedForCurrent = false;
let correctCount = 0;

function buildTablePicker() {
  tablePickerEl.innerHTML = "";
  for (let table = 1; table <= 10; table++) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = String(table);
    button.className = "table-button";
    button.classList.toggle("selected", selectedTables.has(table));
    button.addEventListener("click", () => {
      if (selectedTables.has(table)) {
        selectedTables.delete(table);
      } else {
        selectedTables.add(table);
      }
      button.classList.toggle("selected", selectedTables.has(table));
      startButtonEl.disabled = selectedTables.size === 0;
    });
    tablePickerEl.appendChild(button);
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

export function startMathSettings() {
  buildTablePicker();
  buildCountPicker();
  hintsToggleEl.checked = hintsEnabled;
  startButtonEl.disabled = selectedTables.size === 0;
  showView("view-math-settings");
}

function randomMultiplier(): number {
  return 1 + Math.floor(Math.random() * 10);
}

function buildQueue(): Question[] {
  const tables = [...selectedTables];
  const questions: Question[] = [];
  for (let i = 0; i < selectedCount; i++) {
    const tableNumber = tables[Math.floor(Math.random() * tables.length)];
    questions.push({ tableNumber, operandA: tableNumber, operandB: randomMultiplier() });
  }
  return questions;
}

/** Breaks a table x multiplier question into steps via the nearest round anchor (5 or 10). */
function hintSteps(table: number, multiplier: number): string[] | null {
  if (multiplier === 5 || multiplier === 10) return null;

  const distanceTo5 = Math.abs(multiplier - 5);
  const distanceTo10 = Math.abs(multiplier - 10);
  const anchor = distanceTo10 < distanceTo5 ? 10 : 5;
  const diff = Math.abs(multiplier - anchor);
  const op = multiplier > anchor ? "+" : "−";

  return [
    `${table} × ${anchor} = ${table * anchor}`,
    `${table} × ${diff} = ${table * diff}`,
    `${table * anchor} ${op} ${table * diff} = ${table * multiplier}`,
  ];
}

async function startSession() {
  const res = await fetch("/api/child/math/sessions", { method: "POST" });
  const data = await res.json();
  sessionId = data.sessionId;

  hintsEnabled = hintsToggleEl.checked;
  queue = buildQueue();
  currentIndex = 0;
  correctCount = 0;

  showView("view-math-exercise");
  showQuestion();
}

function showQuestion() {
  const question = queue[currentIndex];
  progressEl.textContent = `Vraag ${currentIndex + 1} van ${queue.length}`;
  questionEl.textContent = `${question.operandA} × ${question.operandB} = ?`;

  currentAnswer = "";
  answered = false;
  hintUsedForCurrent = false;
  answerDisplayEl.innerHTML = "&nbsp;";
  feedbackEl.hidden = true;
  nextButtonEl.hidden = true;

  hintPanelEl.hidden = true;
  hintPanelEl.innerHTML = "";
  hintButtonEl.hidden = !hintsEnabled;

  buildMathPad();
}

hintButtonEl.addEventListener("click", () => {
  const question = queue[currentIndex];
  const steps = hintSteps(question.tableNumber, question.operandB);
  hintUsedForCurrent = true;

  if (!steps) {
    hintPanelEl.innerHTML = `<p>Deze is al makkelijk! 😊</p>`;
  } else {
    hintPanelEl.innerHTML = steps.map((step) => `<p>${step}</p>`).join("");
  }
  hintPanelEl.hidden = false;
});

function renderAnswer() {
  answerDisplayEl.textContent = currentAnswer.length ? currentAnswer : " ";
}

async function submitAnswer() {
  if (answered || currentAnswer.length === 0 || sessionId === null) return;
  answered = true;

  const question = queue[currentIndex];
  const answer = Number(currentAnswer);

  const res = await fetch(`/api/child/math/sessions/${sessionId}/attempts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tableNumber: question.tableNumber,
      operandA: question.operandA,
      operandB: question.operandB,
      answer,
      hintUsed: hintUsedForCurrent,
    }),
  });
  const result = await res.json();

  feedbackEl.hidden = false;
  if (result.correct) {
    correctCount++;
    feedbackEl.textContent = "Goed zo! 🎉";
    feedbackEl.className = "math-feedback correct";
  } else {
    feedbackEl.textContent = `Bijna! Het antwoord is ${result.correctAnswer}.`;
    feedbackEl.className = "math-feedback incorrect";
  }

  nextButtonEl.hidden = false;
}

function buildMathPad() {
  mathPadEl.innerHTML = "";
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
        if (answered) return;
        currentAnswer = currentAnswer.slice(0, -1);
        renderAnswer();
      });
    } else {
      button.textContent = key;
      button.addEventListener("click", () => {
        if (answered || currentAnswer.length >= 3) return;
        currentAnswer += key;
        renderAnswer();
      });
    }

    mathPadEl.appendChild(button);
  }

  const submitButton = document.createElement("button");
  submitButton.type = "button";
  submitButton.textContent = "✓";
  submitButton.className = "submit-button";
  submitButton.addEventListener("click", submitAnswer);
  mathPadEl.appendChild(submitButton);
}

nextButtonEl.addEventListener("click", async () => {
  currentIndex++;
  if (currentIndex >= queue.length) {
    if (sessionId !== null) {
      await fetch(`/api/child/math/sessions/${sessionId}/finish`, { method: "POST" });
    }
    summaryHeadingEl.textContent = `Je had ${correctCount} van de ${queue.length} goed! 🎉`;
    showView("view-math-summary");
    return;
  }
  showQuestion();
});

document.getElementById("math-settings-back")!.addEventListener("click", () => {
  showView("view-home");
});

document.getElementById("math-start-button")!.addEventListener("click", () => {
  startSession();
});

document.getElementById("math-summary-done")!.addEventListener("click", () => {
  showView("view-home");
});
