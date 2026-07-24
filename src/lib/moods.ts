// The shared 1–5 mood scale, used by the dashboard mood chart/input and by the
// (currently unused) standalone mood chart. Index 0 = mood value 1.

export const MOODS = [
  { value: 1, emoji: "😞", label: "Awful" },
  { value: 2, emoji: "🙁", label: "Low" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😄", label: "Great" },
] as const;

/** The scale entry for a 1–5 mood value, or undefined if out of range. */
export function moodMeta(mood: number) {
  return MOODS[mood - 1];
}
