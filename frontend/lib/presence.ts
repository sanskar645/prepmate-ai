// PrepMate AI — Presence (body-language) scoring, pure functions (no deps).
//
// One sample per second while the student is recording. Each sample records
// whether a face was visible and, when it was, the 7 expression probabilities
// from face-api. Video frames NEVER leave the browser — only these counts are
// uploaded with the answer.
//
// score = round(10 * (0.65 * faceRatio + 0.35 * positivity))
//   faceRatio  = fraction of samples with a visible face (attentiveness)
//   positivity = avg(happy) + 0.5*avg(surprised) + 0.5*avg(neutral) over faced
//                samples (engaged affect; a calm neutral answer still counts)
// Deliberately kept separate from the LLM composite score: vision is lighting
// sensitive, so it ships as an engagement *signal*, not a grade component.

export const EXPRESSION_NAMES = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "fearful",
  "disgusted",
  "surprised",
] as const;

export type ExpressionName = (typeof EXPRESSION_NAMES)[number];

export interface PresenceSample {
  hasFace: boolean;
  expressions?: Partial<Record<ExpressionName, number>>;
}

export interface PresenceResult {
  score: number; // 0–10, one decimal
  faceRatio: number; // 0–1, one decimal
  dominantExpression: ExpressionName | null;
  samples: number;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function computePresenceScore(
  samples: PresenceSample[]
): PresenceResult | null {
  // No samples = camera was off/unavailable → no signal (NOT a zero).
  if (!samples.length) return null;

  const faced = samples.filter((s) => s.hasFace);
  const faceRatio = round1(faced.length / samples.length);

  const withExpr = faced.filter((s) => s.expressions);
  const avg: Record<ExpressionName, number> = {
    neutral: 0,
    happy: 0,
    sad: 0,
    angry: 0,
    fearful: 0,
    disgusted: 0,
    surprised: 0,
  };
  if (withExpr.length) {
    for (const s of withExpr) {
      for (const name of EXPRESSION_NAMES) {
        avg[name] += s.expressions?.[name] ?? 0;
      }
    }
    for (const name of EXPRESSION_NAMES) avg[name] /= withExpr.length;
  }

  let dominantExpression: ExpressionName | null = null;
  if (withExpr.length) {
    dominantExpression = EXPRESSION_NAMES.reduce((a, b) =>
      avg[a] >= avg[b] ? a : b
    );
  }

  const positivity = clamp01(
    avg.happy + 0.5 * avg.surprised + 0.5 * avg.neutral
  );
  const score = round1(10 * (0.65 * faceRatio + 0.35 * positivity));

  return { score, faceRatio, dominantExpression, samples: samples.length };
}
