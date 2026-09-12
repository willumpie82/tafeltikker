import { showView } from "./views.js";
import { setupAutoAdvance } from "./next-button.js";

type Question = { tableNumber: number; operandA: number; operandB: number };
type Difficulty = "easy" | "medium" | "hard";

const COUNT_OPTIONS = [5, 10, 20];
const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: "easy", label: "Makkelijk" },
  { id: "medium", label: "Gemiddeld" },
  { id: "hard", label: "Moeilijk" },
];
const MAX_TRIES = 3; // used by both "medium" and "hard"
const AUTO_ADVANCE_MS = 3000;
const HARD_TRY_SECONDS = 8; // "hard" only: run out of time on a try and it's marked wrong

const selectedTables = new Set<number>();
let selectedCount = 10;
let selectedDifficulty: Difficulty = "medium";

const tablePickerEl = document.getElementById("table-picker")!;
const countPickerEl = document.getElementById("count-picker")!;
const difficultyPickerEl = document.getElementById("difficulty-picker")!;
const startButtonEl = document.getElementById("math-start-button") as HTMLButtonElement;

const progressEl = document.getElementById("math-progress")!;
const questionEl = document.getElementById("math-question")!;
const hintPanelEl = document.getElementById("hint-panel")!;
const optionsEl = document.getElementById("math-options")!;
const answerDisplayEl = document.getElementById("math-answer-display")!;
const feedbackEl = document.getElementById("math-feedback")!;
const mathPadEl = document.getElementById("math-pad")!;
const nextButtonEl = document.getElementById("math-next-button") as HTMLButtonElement;

const summaryHeadingEl = document.getElementById("math-summary-heading")!;
const progressBarFillEl = document.getElementById("math-progress-bar-fill") as HTMLElement;
const tryTimerEl = document.getElementById("math-try-timer")!;
const nextHintEl = document.getElementById("math-next-hint")!;
const tableProgressEl = document.getElementById("table-progress")!;

let sessionId: number | null = null;
let queue: Question[] = [];
let currentIndex = 0;
let targetCount = 0;
let currentAnswer = "";
let answered = false;
let hintUsedForCurrent = false;
let triesUsed = 0;
let correctCount = 0;
let triesForCorrect: number[] = [];
let tryTimerInterval: number | undefined;
let tryTimeRemaining = 0;
let correctCombos = new Set<string>();

function comboKey(table: number, multiplier: number): string {
  return `${table}x${multiplier}`;
}

function renderTableProgress() {
  tableProgressEl.innerHTML = "";
  for (const table of [...selectedTables].sort((a, b) => a - b)) {
    const row = document.createElement("div");
    row.className = "table-progress-row";

    const label = document.createElement("span");
    label.className = "table-label";
    label.textContent = `Tafel ${table}:`;
    row.appendChild(label);

    const cells = document.createElement("div");
    cells.className = "table-cells";
    for (let multiplier = 1; multiplier <= 10; multiplier++) {
      const cell = document.createElement("span");
      cell.className = "table-progress-cell" + (correctCombos.has(comboKey(table, multiplier)) ? " done" : "");
      cell.textContent = String(multiplier);
      cells.appendChild(cell);
    }
    row.appendChild(cells);

    tableProgressEl.appendChild(row);
  }
}

const nextAdvance = setupAutoAdvance(nextButtonEl, AUTO_ADVANCE_MS, () => advanceToNext());

function startTryTimerIfNeeded() {
  cancelTryTimer();
  if (selectedDifficulty !== "hard") return;

  tryTimeRemaining = HARD_TRY_SECONDS;
  tryTimerEl.hidden = false;
  tryTimerEl.textContent = `⏱ ${tryTimeRemaining}s`;
  tryTimerInterval = window.setInterval(() => {
    tryTimeRemaining--;
    if (tryTimeRemaining <= 0) {
      cancelTryTimer();
      if (!answered) resolveTry(-1);
      return;
    }
    tryTimerEl.textContent = `⏱ ${tryTimeRemaining}s`;
  }, 1000);
}

function cancelTryTimer() {
  if (tryTimerInterval !== undefined) {
    window.clearInterval(tryTimerInterval);
    tryTimerInterval = undefined;
  }
  tryTimerEl.hidden = true;
}

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

function buildDifficultyPicker() {
  difficultyPickerEl.innerHTML = "";
  difficultyPickerEl.style.gridTemplateColumns = "repeat(3, 1fr)";
  for (const difficulty of DIFFICULTIES) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = difficulty.label;
    button.className = "table-button";
    button.classList.toggle("selected", difficulty.id === selectedDifficulty);
    button.addEventListener("click", () => {
      selectedDifficulty = difficulty.id;
      difficultyPickerEl.querySelectorAll(".table-button").forEach((el) => el.classList.remove("selected"));
      button.classList.add("selected");
    });
    difficultyPickerEl.appendChild(button);
  }
}

export function startMathSettings() {
  buildTablePicker();
  buildCountPicker();
  buildDifficultyPicker();
  startButtonEl.disabled = selectedTables.size === 0;
  showView("view-math-settings");
}

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function buildQueue(): Question[] {
  const baseQuestions: Question[] = [];
  for (const tableNumber of selectedTables) {
    for (let multiplier = 1; multiplier <= 10; multiplier++) {
      baseQuestions.push({ tableNumber, operandA: tableNumber, operandB: multiplier });
    }
  }

  // Shuffle in fresh "laps" through every fact rather than sampling with
  // replacement, so the same table x multiplier can't turn up twice in a
  // row just by chance within the chosen count.
  const questions: Question[] = [];
  while (questions.length < selectedCount) {
    questions.push(...shuffled(baseQuestions));
  }
  return questions.slice(0, selectedCount);
}

/** Breaks a table x multiplier question into steps via the nearest round anchor (5 or 10). */
function hintSteps(table: number, multiplier: number): string[] | null {
  if (multiplier === 1 || multiplier === 5 || multiplier === 10) return null;

  // For a small multiplier, decomposing via x5/x10 detours through a bigger
  // intermediate number than the exercise itself (e.g. 3x2 -> 3x5 - 3x3).
  // Plain repeated addition is simpler whenever the anchor isn't actually
  // smaller than the multiplier.
  if (multiplier < 5) {
    return [`Nu jij: ${Array(multiplier).fill(table).join(" + ")} = ?`];
  }

  const distanceTo5 = Math.abs(multiplier - 5);
  const distanceTo10 = Math.abs(multiplier - 10);
  const anchor = distanceTo10 < distanceTo5 ? 10 : 5;
  const diff = Math.abs(multiplier - anchor);
  const op = multiplier > anchor ? "+" : "−";

  return [
    `${table} × ${anchor} = ${table * anchor}`,
    `${table} × ${diff} = ${table * diff}`,
    `Nu jij: ${table * anchor} ${op} ${table * diff} = ?`,
  ];
}

async function startSession() {
  const res = await fetch("/api/child/math/sessions", { method: "POST" });
  const data = await res.json();
  sessionId = data.sessionId;

  queue = buildQueue();
  currentIndex = 0;
  targetCount = selectedCount;
  correctCount = 0;
  triesForCorrect = [];
  correctCombos = new Set();
  renderTableProgress();

  showView("view-math-exercise");
  showQuestion();
}

function showQuestion() {
  const question = queue[currentIndex];
  progressEl.textContent = `Goed: ${correctCount} van de ${targetCount}`;
  progressBarFillEl.style.width = `${(correctCount / targetCount) * 100}%`;
  questionEl.textContent = `${question.operandA} × ${question.operandB} = ?`;

  currentAnswer = "";
  answered = false;
  hintUsedForCurrent = false;
  triesUsed = 0;
  answerDisplayEl.innerHTML = "&nbsp;";
  feedbackEl.hidden = true;
  nextButtonEl.hidden = true;
  nextHintEl.hidden = true;
  nextAdvance.cancel();

  hintPanelEl.innerHTML = "";

  if (selectedDifficulty === "easy") {
    optionsEl.hidden = false;
    mathPadEl.hidden = true;
    answerDisplayEl.hidden = true;
    buildOptions(question);
  } else {
    optionsEl.hidden = true;
    mathPadEl.hidden = false;
    answerDisplayEl.hidden = false;
    buildMathPad();
  }

  startTryTimerIfNeeded();
}

function buildOptions(question: Question) {
  const correct = question.operandA * question.operandB;
  const options = new Set<number>([correct]);
  while (options.size < 4) {
    const delta = Math.floor(Math.random() * 10) + 1;
    const sign = Math.random() < 0.5 ? -1 : 1;
    const candidate = correct + sign * delta;
    if (candidate >= 0) options.add(candidate);
  }
  const shuffled = [...options].sort(() => Math.random() - 0.5);

  optionsEl.innerHTML = "";
  for (const value of shuffled) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option-button";
    button.textContent = String(value);
    button.addEventListener("click", () => selectOption(value));
    optionsEl.appendChild(button);
  }
}

async function selectOption(value: number) {
  if (answered) return;
  answered = true;
  optionsEl.querySelectorAll("button").forEach((b) => ((b as HTMLButtonElement).disabled = true));
  await finalizeAttempt(value, false);
}

function showHintPanel(question: Question) {
  const steps = hintSteps(question.tableNumber, question.operandB);
  hintPanelEl.innerHTML = steps ? steps.map((step) => `<p>${step}</p>`).join("") : `<p>Deze is al makkelijk! 😊</p>`;
}

function renderAnswer() {
  answerDisplayEl.textContent = currentAnswer.length ? currentAnswer : " ";
}

async function finalizeAttempt(answerValue: number, hintUsed: boolean) {
  if (sessionId === null) return;
  const question = queue[currentIndex];

  const res = await fetch(`/api/child/math/sessions/${sessionId}/attempts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tableNumber: question.tableNumber,
      operandA: question.operandA,
      operandB: question.operandB,
      answer: answerValue,
      hintUsed,
    }),
  });
  const result = await res.json();

  if (result.correct) {
    correctCount++;
    // "easy" is always a single shot (try 1); medium/hard track their own tries.
    triesForCorrect.push(selectedDifficulty === "easy" ? 1 : triesUsed);
    correctCombos.add(comboKey(question.tableNumber, question.operandB));
    renderTableProgress();
  } else {
    // wrong answers don't count toward progress — try this same fact again later
    queue.push({ ...question });
  }

  feedbackEl.hidden = false;
  feedbackEl.textContent = result.correct ? "Goed zo! 🎉" : `Het antwoord is ${result.correctAnswer}. Deze komt straks nog een keer terug.`;
  feedbackEl.className = "math-feedback " + (result.correct ? "correct" : "incorrect");

  nextButtonEl.hidden = false;

  // A visible hint on a wrong final answer needs reading time — don't rush
  // that with the auto-advance timer. A correct answer needs no pause, even
  // if a hint was shown earlier (e.g. Gemiddeld's pre-last-try hint).
  if (hintUsedForCurrent && !result.correct) {
    nextHintEl.hidden = false;
  } else {
    nextAdvance.start();
  }
}

async function resolveTry(answerValue: number) {
  if (answered || sessionId === null) return;

  const question = queue[currentIndex];
  const correctAnswer = question.operandA * question.operandB;

  triesUsed++;
  const isCorrect = answerValue === correctAnswer;
  const isFinalTry = triesUsed >= MAX_TRIES;

  if (isCorrect) {
    answered = true;
    cancelTryTimer();
    await finalizeAttempt(answerValue, hintUsedForCurrent);
    return;
  }

  if (isFinalTry) {
    answered = true;
    cancelTryTimer();
    if (selectedDifficulty === "hard") {
      // no help while solving on "hard" — only explain once all tries are gone
      hintUsedForCurrent = true;
      showHintPanel(question);
    }
    await finalizeAttempt(answerValue, hintUsedForCurrent);
    return;
  }

  // wrong, tries remain
  currentAnswer = "";
  renderAnswer();
  feedbackEl.hidden = false;
  feedbackEl.className = "math-feedback retry";

  if (selectedDifficulty === "medium" && triesUsed === MAX_TRIES - 1) {
    // "medium" gets a hint before the last try; "hard" never does
    hintUsedForCurrent = true;
    showHintPanel(question);
    feedbackEl.textContent = "Laatste kans! Hier is een hintje.";
  } else {
    feedbackEl.textContent = `Bijna! Probeer nog eens (nog ${MAX_TRIES - triesUsed} keer).`;
  }

  startTryTimerIfNeeded();
}

async function submitAnswer() {
  if (answered || currentAnswer.length === 0 || sessionId === null) return;
  // "easy" answers via buildOptions()/selectOption(), never the numpad.
  if (selectedDifficulty === "easy") return;

  await resolveTry(Number(currentAnswer));
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

async function advanceToNext() {
  currentIndex++;
  if (correctCount >= targetCount) {
    if (sessionId !== null) {
      await fetch(`/api/child/math/sessions/${sessionId}/finish`, { method: "POST" });
    }
    const tryWeight = (tryNumber: number) => (tryNumber <= 1 ? 1 : tryNumber === 2 ? 0.66 : 0.33);
    const avgScore = Math.round(
      (triesForCorrect.reduce((sum, tryNumber) => sum + tryWeight(tryNumber), 0) / targetCount) * 100,
    );
    summaryHeadingEl.textContent =
      avgScore >= 100
        ? `Geweldig! Alle ${targetCount} sommen in één keer goed! 🎉`
        : `Je hebt alle ${targetCount} sommen goed gemaakt! Gemiddelde score: ${avgScore}% 🎉`;
    showView("view-math-summary");
    return;
  }
  showQuestion();
}

const exerciseViewEl = document.getElementById("view-math-exercise") as HTMLElement;

document.addEventListener("keydown", (event) => {
  if (exerciseViewEl.hidden || selectedDifficulty === "easy" || answered) return;

  if (event.key >= "0" && event.key <= "9") {
    if (currentAnswer.length >= 3) return;
    currentAnswer += event.key;
    renderAnswer();
  } else if (event.key === "Backspace") {
    event.preventDefault();
    currentAnswer = currentAnswer.slice(0, -1);
    renderAnswer();
  } else if (event.key === "Enter") {
    submitAnswer();
  }
});

document.getElementById("math-settings-back")!.addEventListener("click", () => {
  showView("view-home");
});

document.getElementById("math-exercise-back")!.addEventListener("click", async () => {
  nextAdvance.cancel();
  cancelTryTimer();
  if (sessionId !== null) {
    await fetch(`/api/child/math/sessions/${sessionId}/finish`, { method: "POST" });
    sessionId = null;
  }
  showView("view-home");
});

document.getElementById("math-start-button")!.addEventListener("click", () => {
  startSession();
});

document.getElementById("math-summary-done")!.addEventListener("click", () => {
  showView("view-home");
});
