export const AI_RATING_OPTIONS = [
  { value: 1320, label: "1320 · Beginner" },
  { value: 1500, label: "1500 · Casual" },
  { value: 1700, label: "1700 · Club" },
  { value: 1900, label: "1900 · Advanced" },
  { value: 2100, label: "2100 · Expert" },
  { value: 2300, label: "2300 · Master" },
  { value: 2500, label: "2500 · Grandmaster" },
  { value: 2800, label: "2800 · Elite" },
  { value: 3100, label: "3100 · Near maximum" }
] as const;

export type AiRating = (typeof AI_RATING_OPTIONS)[number]["value"] | null;
