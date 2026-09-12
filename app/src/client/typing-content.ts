export type TypingLevel = "letters" | "words" | "sentences";

export const TYPING_LEVELS: { id: TypingLevel; label: string }[] = [
  { id: "letters", label: "Letters" },
  { id: "words", label: "Woorden" },
  { id: "sentences", label: "Zinnetjes" },
];

const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");

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

export function promptsFor(level: TypingLevel, count: number): string[] {
  const pool = [...PROMPTS[level]];
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    if (pool.length === 0) pool.push(...PROMPTS[level]);
    const index = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(index, 1)[0]);
  }
  return result;
}
