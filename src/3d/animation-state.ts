const GREETING_RE =
  /\b(hi|hello|hey|good morning|good afternoon|good evening|howdy|greetings|yo|sup|hola|buenos días|buenas tardes|buenas noches|saludos)\b/i;

const DANCE_RE =
  /\b(can you dance|dance for me|dance please|do a dance|show me a dance|dance|bailar|puedes bailar|baila)\b/i;

const MAX_GREETING_WORDS = 3;
const MAX_DANCE_WORDS = 5;

export function isGreeting(text: string): boolean {
  const words = text.trim().split(/\s+/);
  return words.length <= MAX_GREETING_WORDS && GREETING_RE.test(text);
}

export function isDance(text: string): boolean {
  const words = text.trim().split(/\s+/);
  return words.length <= MAX_DANCE_WORDS && DANCE_RE.test(text);
}

export type AnimationHint = "talking" | "waving" | "dance";
export type AnimationState = "idle" | AnimationHint;

export const ANIMATION_KEYS: AnimationState[] = [
  "idle",
  "talking",
  "waving",
  "dance",
];

export function detectHint(text: string): AnimationHint {
  if (isGreeting(text)) return "waving";
  if (isDance(text)) return "dance";
  return "talking";
}
