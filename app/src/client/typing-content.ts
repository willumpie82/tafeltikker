export type TypingLevel = "letters" | "words" | "sentences";

export const TYPING_LEVELS: { id: TypingLevel; label: string }[] = [
  { id: "letters", label: "Letters" },
  { id: "words", label: "Woorden" },
  { id: "sentences", label: "Zinnetjes" },
];

export type WordLevel = { id: string; label: string; words: string[]; sentences: string[] };

// "Letters" warms up through keyboard rows instead of jumping straight to the
// full alphabet — same row groupings as the on-screen keyboard.
const HOME_ROW = "asdfghjkl".split("");
const TOP_ROW = "qwertyuiop".split("");
const BOTTOM_ROW = "zxcvbnm".split("");

// Physical QWERTY row order (top to bottom) — shared by the on-screen
// keyboard and the parent dashboard's per-letter breakdown, so a parent can
// see which area of the keyboard is problematic instead of an a-z list.
export const QWERTY_ROWS: string[][] = [TOP_ROW, HOME_ROW, BOTTOM_ROW];

// AVI M4–E4 (groep 4~5)
const WORDS_AVI_M4_E4 = [
  "kat", "hond", "bal", "boom", "huis", "fiets", "zon", "maan", "vis", "pen",
  "tas", "muur", "deur", "stoel", "tafel", "boek", "appel", "peer", "banaan", "school",
  "auto", "trein", "bus", "vogel", "vlinder", "bloem", "gras", "water", "melk", "brood",
  "kaas", "ei", "soep", "mes", "vork", "lepel", "bord", "kop", "raam", "bed",
  "kussen", "deken", "lamp", "klok", "trap", "kast", "spiegel", "bad", "zeep", "handdoek",
  "jas", "muts", "sjaal", "schoen", "sok", "broek", "trui", "hemd", "rok", "pet",
  "bril", "hoed", "ring", "riem", "knoop", "rits", "zak", "koffer", "doos", "mand",
  "bal", "pop", "beer", "trein", "auto", "bootje", "vlieger", "step", "skate", "bal",
];

// No trailing period — punctuation isn't the point of this mode, and
// requiring it just adds friction (forget it once and you're stuck).
const SENTENCES_AVI_M4_E4 = [
  "de kat zit op de mat",
  "ik lees een boek",
  "de zon schijnt vandaag",
  "wij gaan naar school",
  "de hond rent hard",
  "mama kookt lekker eten",
  "papa leest de krant",
  "het is een mooie dag",
  "de bal ligt in de tuin",
  "wij spelen buiten samen",
  "de vogel vliegt hoog",
  "ik eet een appel",
  "de trein rijdt snel",
  "wij zwemmen in het water",
  "de vis zwemt in de sloot",
  "opa zit in de tuin",
  "oma bakt een taart",
  "ik ga naar bed",
  "de maan schijnt in de nacht",
  "wij fietsen naar school",
  "de bloem staat in de vaas",
  "het regent buiten hard",
  "ik was mijn handen",
  "de wind waait door de bomen",
  "wij lopen naar het park",
  "de hond blaft naar de kat",
  "ik drink een glas melk",
  "de bus stopt bij de stop",
  "wij tekenen een mooie tekening",
  "de juf leest een verhaal voor",
  "ik speel met mijn vriend",
  "de kip legt een ei",
  "wij eten aan tafel",
  "de auto staat voor het huis",
  "ik poets mijn tanden",
  "de sneeuw valt zacht naar beneden",
  "wij bouwen een toren van blokken",
  "de koe staat in de wei",
  "ik geef mijn broer een hand",
  "de zon gaat onder",
  "wij zingen een liedje",
  "de bal rolt van de tafel",
  "ik pak mijn jas van de kapstok",
  "de kikker springt in het water",
  "wij spelen verstoppertje",
  "de wekker gaat om zeven uur",
  "ik zit op de stoel",
  "de wolken hangen laag in de lucht",
  "wij maken een sneeuwpop",
  "de kip loopt door de tuin",
  "ik schrijf mijn naam op",
  "de bel gaat aan de deur",
  "wij spelen een spelletje samen",
  "de baby slaapt in de wieg",
  "ik ruim mijn kamer op",
  "de bloemen groeien in de tuin",
];

// Woorden/Zinnetjes are graded by AVI reading level (a Dutch primary-school
// reading-difficulty scale) — a parent assigns a child's level, since it
// reflects actual reading ability rather than something a kid picks for
// themselves each session. Only one tier exists today; more (e.g. a higher
// "AVI E5–M6") get their own entry here later.
export const WORD_LEVELS: WordLevel[] = [
  { id: "avi_m4_e4", label: "AVI M4–E4 (groep 4~5)", words: WORDS_AVI_M4_E4, sentences: SENTENCES_AVI_M4_E4 },
];
export const DEFAULT_WORD_LEVEL_ID = WORD_LEVELS[0].id;

export function wordLevelFor(id: string | null | undefined): WordLevel {
  return WORD_LEVELS.find((w) => w.id === id) ?? WORD_LEVELS[0];
}

export function promptsFor(level: TypingLevel, count: number, wordLevelId?: string | null): string[] {
  if (level === "letters") {
    return lettersWithWarmup(count);
  }

  const tier = wordLevelFor(wordLevelId);
  const source = level === "words" ? tier.words : tier.sentences;
  const pool = [...source];
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    if (pool.length === 0) pool.push(...source);
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
