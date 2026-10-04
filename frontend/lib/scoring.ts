// PrepMate AI — Scoring utilities (client-side wrappers matching Section 5)

export function calcComposite(tech: number, comm: number, rel: number): number {
  return Math.round((0.5 * tech + 0.3 * comm + 0.2 * rel) * 100) / 100;
}

export function calcSessionScore(
  answers: { composite_score: number }[]
): number {
  const n = answers.length;
  if (n === 0) return 0;
  let total = 0;
  let weightSum = 0;
  answers.forEach((ans, i) => {
    const w = 1 + (i + 1) / n;
    total += w * ans.composite_score;
    weightSum += w;
  });
  return Math.round((total / weightSum) * 10 * 100) / 100;
}

export function formatPRS(prs: number): string {
  if (prs >= 75) return "Placement Ready 🎯";
  if (prs >= 50) return "Developing 📈";
  return "Needs Practice 🔧";
}
