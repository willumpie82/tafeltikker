export type TypingLevel = "letters" | "words" | "sentences";

export const TYPING_LEVELS: { id: TypingLevel; label: string }[] = [
  { id: "letters", label: "Letters" },
  { id: "words", label: "Woorden" },
  { id: "sentences", label: "Zinnetjes" },
];

const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");

// "Letters" warms up through keyboard rows instead of jumping straight to the
// full alphabet — same row groupings as the on-screen keyboard.
const HOME_ROW = "asdfghjkl".split("");
const TOP_ROW = "qwertyuiop".split("");
const BOTTOM_ROW = "zxcvbnm".split("");

const WORDS = [
  "kat", "hond", "bal", "boom", "huis", "fiets", "zon", "maan", "vis", "pen",
  "tas", "muur", "deur", "stoel", "tafel", "boek", "appel", "peer", "banaan", "school",
];

const SENTENCES = [
  "de kat zit op de mat.",
  "ik lees een boek.",
  "de zon schijnt vandaag.",
  "wij gaan naar school.",
  "de hond rent hard.",
  "mama kookt lekker eten.",
  "papa leest de krant.",
  "het is een mooie dag.",
  "de bal ligt in de tuin.",
  "wij spelen buiten samen.",
];

const PROMPTS: Record<TypingLevel, string[]> = {
  letters: LETTERS,
  words: WORDS,
  sentences: SENTENCES,
};

// Full pool per level (letters ignores the warm-up subset) — used by the
// parent dashboard to show every possible prompt, including ones not yet
// attempted, rather than only the ones that happen to appear in the stats.
export const PROMPT_POOLS: Record<TypingLevel, string[]> = PROMPTS;

export function promptsFor(level: TypingLevel, count: number): string[] {
  if (level === "letters") {
    return lettersWithWarmup(count);
  }

  const pool = [...PROMPTS[level]];
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    if (pool.length === 0) pool.push(...PROMPTS[level]);
    const index = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(index, 1)[0]);
  }
  return result;
}

/** First third: home row only. Middle third: + top row. Final third: full alphabet. */
function lettersWithWarmup(count: number): string[] {
  const result: string[] = [];
  let lastLetter = "";

  for (let i = 0; i < count; i++) {
    const pool = i < count / 3 ? HOME_ROW : i < (2 * count) / 3 ? [...HOME_ROW, ...TOP_ROW] : [...HOME_ROW, ...TOP_ROW, ...BOTTOM_ROW];

    let letter: string;
    do {
      letter = pool[Math.floor(Math.random() * pool.length)];
    } while (letter === lastLetter && pool.length > 1);

    lastLetter = letter;
    result.push(letter);
  }

  return result;
}
