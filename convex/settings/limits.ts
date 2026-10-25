// Allowed ranges for orgSettings, shared by orgSettings.update and the Settings
// forms. Pure data, so the browser can import it.
export const ORG_LIMITS = {
  reviewIntervalMonths: [1, 60],
  dueSoonDays: [1, 180],
  passMark: [50, 100],
  dueDays: [1, 365],
  refreshMonths: [1, 120],
  // trainings.ts MAX_QUESTIONS_PER_OBJECTIVE
  questionsPerObjective: [1, 3],
  failsBeforeWalkthrough: [1, 10],
  checkInIdleMinutes: [1, 240],
  captureRetentionDays: [7, 3650],
  captureNoticeChars: [0, 1000],
} as const
