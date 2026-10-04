import { computePresenceScore } from "./presence";

let failures = 0;
function check(label: string, cond: boolean, detail: unknown = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}` + (detail !== "" ? ` | ${detail}` : ""));
}

// 1. No samples → null (camera off is "no signal", never a zero)
check("empty → null", computePresenceScore([]) === null);

// 2. Fully engaged: face always present, happy throughout
const happy = Array.from({ length: 30 }, () => ({
  hasFace: true,
  expressions: { neutral: 0.1, happy: 0.8, sad: 0, angry: 0, fearful: 0, disgusted: 0, surprised: 0.1 },
}));
const r2 = computePresenceScore(happy)!;
check("engaged score high", r2.score >= 8, r2.score);
check("faceRatio 1", r2.faceRatio === 1);
check("dominant happy", r2.dominantExpression === "happy");

// 3. Looking away half the time, neutral otherwise
const mixed = [
  ...Array.from({ length: 15 }, () => ({ hasFace: false })),
  ...Array.from({ length: 15 }, () => ({
    hasFace: true,
    expressions: { neutral: 0.9, happy: 0.05, sad: 0, angry: 0, fearful: 0, disgusted: 0, surprised: 0.05 },
  })),
];
const r3 = computePresenceScore(mixed)!;
// faceRatio 0.5, positivity = 0.05+0.025+0.45 = 0.525 → 10*(0.325+0.18375) = 5.1
check("half-absent ≈ 5.1", r3.score === 5.1, r3.score);
check("faceRatio 0.5", r3.faceRatio === 0.5);

// 4. Camera on but face never found → honest low score, no dominant expression
const away = Array.from({ length: 10 }, () => ({ hasFace: false }));
const r4 = computePresenceScore(away)!;
check("never-visible → 0", r4.score === 0, r4.score);
check("no dominant expression", r4.dominantExpression === null);

// 5. Flat neutral all through (calm answering still counts)
const flat = Array.from({ length: 20 }, () => ({
  hasFace: true,
  expressions: { neutral: 1, happy: 0, sad: 0, angry: 0, fearful: 0, disgusted: 0, surprised: 0 },
}));
const r5 = computePresenceScore(flat)!;
// positivity = 0.5 → 10*(0.65+0.175) = 8.25 → 8.3? round1(8.25)=8.2 or 8.3 (fp) — check range
check("flat neutral in [8, 8.5]", r5.score >= 8 && r5.score <= 8.5, r5.score);

// 6. Angry/frustrated throughout → low positivity but full presence
const angry = Array.from({ length: 20 }, () => ({
  hasFace: true,
  expressions: { neutral: 0.1, happy: 0, sad: 0.1, angry: 0.8, fearful: 0, disgusted: 0, surprised: 0 },
}));
const r6 = computePresenceScore(angry)!;
// positivity = 0.05 → 10*(0.65+0.0175) = 6.675 → 6.7
check("angry ≈ 6.7", r6.score === 6.7, r6.score);

// 7. Face present but expression net missing (detector w/o expressions) → uses faceRatio only
const noExpr = Array.from({ length: 10 }, () => ({ hasFace: true }));
const r7 = computePresenceScore(noExpr)!;
check("no-expression samples → 6.5", r7.score === 6.5, r7.score);
check("dominant null without expressions", r7.dominantExpression === null);

// 8. Bounds on adversarial input
const junk = computePresenceScore([
  { hasFace: true, expressions: { happy: 99 } },
  { hasFace: true, expressions: { angry: -5 } },
])!;
check("clamped to 0–10", junk.score >= 0 && junk.score <= 10, junk.score);

console.log(failures ? `\nRESULT: ${failures} FAILURES` : "\nRESULT: ALL PASS");
process.exit(failures ? 1 : 0);
