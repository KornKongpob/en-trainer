// Spaced-repetition engine used by Flashcards & Quiz

/* ===== Time helpers ===== */
export const MS = { min: 60_000, hour: 3_600_000, day: 86_400_000 };
export const nowMs = () => Date.now();
const toKeyDate = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
export const todayKey = () => toKeyDate(new Date());

export function humanizeMs(ms) {
  if (ms < MS.hour) return `${Math.max(1, Math.round(ms / MS.min))}m`;
  if (ms < MS.day)  return `${Math.max(1, Math.round(ms / MS.hour))}h`;
  return `${Math.max(1, Math.round(ms / MS.day))}d`;
}

/* ===== Progress shape ===== */
const PROG_DEFAULT = {
  ef: 2.5,
  interval: 0,          // days, if < 1 it means "minutes schedule" (see dueAt)
  reps: 0,
  reviews: 0,
  correct: 0,
  wrong: 0,
  introduced: true,
  introducedOn: null,

  // scheduling
  due: todayKey(),
  dueAt: nowMs(),

  // latency
  lastLatencyMs: null,
  avgLatencyMs: null,
  latencyCount: 0,
  latencyHistory: [],

  // day-3+ penalties
  penaltyDateKey: null,
  penaltyLevelToday: 0,
};

export function safeProgress(p) {
  return { ...PROG_DEFAULT, ...(p || {}) };
}

/* ===== Settings sanitizer ===== */
function normalizeSettings(s = {}) {
  const out = { ...s };
  out.intervals = { easy: 3, good: 2, hard: 1, ...(s.intervals || {}) };
  out.day1 = { againMins: 10, hardMins: 60, goodDays: 1, easyDays: 2, ...(s.day1 || {}) };
  out.day2 = { againMins: 5,  hardMins: 15, goodDays: 1, easyDays: 2, ...(s.day2 || {}) };
  out.timing = { fastMs: 5000, slowMs: 25000, clampMin: 0.75, clampMax: 1.25, ...(s.timing || {}) };
  out.penalties = {
    day3AgainMins: 15,
    l1: { hard: 0.40, good: 0.60, easy: 0.60, ...(s.penalties?.l1 || {}) },
    l2plus: { hard: 0.25, good: 0.50, easy: 0.50, ...(s.penalties?.l2plus || {}) },
    maxLevel: 10,
    compoundAfterL1: false,
    ...(s.penalties || {}),
  };
  return out;
}

/* ===== Small helpers ===== */
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

function stageFor(prog) {
  // Day-1: first ever grade; Day-2: second; Day-3+: 3rd+
  const r = Number(prog.reviews || 0);
  if (r <= 0) return 1;
  if (r === 1) return 2;
  return 3;
}

function timingFactor(latencyMs, timing) {
  if (latencyMs == null) return 1;
  const { fastMs, slowMs, clampMin, clampMax } = timing;
  if (latencyMs <= fastMs) return clampMax;
  if (latencyMs >= slowMs) return clampMin;
  const t = (latencyMs - fastMs) / Math.max(1, slowMs - fastMs); // 0..1
  // Blend from max -> min as latency gets slower
  return clampMax + (clampMin - clampMax) * clamp(t, 0, 1);
}

function penaltyFactor(level, penalties, grade) {
  if (!level || level <= 0) return 1;
  const { l1, l2plus, compoundAfterL1 } = penalties;
  const base = level === 1 ? (l1[grade] ?? 1) : (l2plus[grade] ?? 1);
  if (!compoundAfterL1 || level <= 1) return base;
  // Apply ^(level-1) after first level if compounding is enabled
  return Math.pow(base, Math.max(1, level - 1));
}

function updateEF(ef, grade) {
  // Basic SM-2 EF update using 0..5 mapping
  const q = grade === "easy" ? 5 : grade === "good" ? 4 : grade === "hard" ? 3 : 1; // again=1
  const next = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  return Math.max(1.3, Math.min(2.8, next));
}

/* ===== Core: compute next interval (MS) without side-effects ===== */
function computeNextMs(progIn, grade, settings, latencyMsForTiming) {
  const prog = safeProgress(progIn);
  const S = normalizeSettings(settings);
  const stg = stageFor(prog);

  // Day-1 / Day-2: fixed knobs in minutes/days
  if (stg === 1 || stg === 2) {
    const D = stg === 1 ? S.day1 : S.day2;
    if (grade === "again") return Math.max(1, D.againMins) * MS.min;
    if (grade === "hard")  return Math.max(1, D.hardMins)  * MS.min;
    const baseDays = grade === "good" ? Math.max(1, D.goodDays) : Math.max(2, D.easyDays);
    // Enforce Easy >= Good + 1 day on Day-1/2
    const days = grade === "easy" ? Math.max(baseDays, (D.goodDays || 1) + 1) : baseDays;
    return days * MS.day;
  }

  // Day-3+
  if (grade === "again") {
    return Math.max(1, S.penalties.day3AgainMins) * MS.min;
  }

  // For Hard/Good/Easy:
  const baseDays = Math.max(1, Number(prog.interval || 1));
  const mult = S.intervals[grade] || 1; // treat these as multipliers on the current interval
  const timing = timingFactor(latencyMsForTiming, S.timing);
  const penalties = penaltyFactor(prog.penaltyLevelToday || 0, S.penalties, grade);

  let days = baseDays * mult * timing * penalties;

  // Safety: ensure Easy > Good by at least 1 day on Day-3+
  if (grade === "easy") {
    const goodDaysCandidate = baseDays * (S.intervals.good || 1) * timing * penaltyFactor(prog.penaltyLevelToday || 0, S.penalties, "good");
    days = Math.max(days, Math.ceil(goodDaysCandidate + 1));
  }

  return Math.max(MS.min, days * MS.day);
}

/* ===== Preview label for buttons ===== */
export function previewLabel(prog, grade, settings) {
  const S = normalizeSettings(settings);
  // Use last latency or fastMs as a neutral preview
  const latency = prog?.lastLatencyMs ?? S.timing.fastMs;
  const ms = computeNextMs(prog, grade, S, latency);
  return humanizeMs(ms);
}

/* ===== Apply a grade and return updated progress ===== */
export function applyGradeUpdate(progIn, grade, settings, measuredLatencyMs) {
  const S = normalizeSettings(settings);
  const prev = safeProgress(progIn);
  const today = todayKey();

  // Reset penalties when date changes
  let penaltyLevelToday = prev.penaltyLevelToday || 0;
  let penaltyDateKey = prev.penaltyDateKey || null;
  if (penaltyDateKey !== today) {
    penaltyLevelToday = 0;
    penaltyDateKey = today;
  }

  // Next interval
  const nextMs = computeNextMs(prev, grade, S, measuredLatencyMs);
  const nextDueAt = nowMs() + nextMs;
  const nextDueKey = toKeyDate(new Date(nextDueAt));

  // Day-3+ Again: bump penalty level
  if (stageFor(prev) >= 3 && grade === "again") {
    penaltyLevelToday = Math.min((S.penalties?.maxLevel ?? 10), (penaltyLevelToday || 0) + 1);
  }

  // EF + counters
  const nextEF = updateEF(prev.ef ?? 2.5, grade);
  const nextReviews = (prev.reviews || 0) + 1;
  const nextReps = (prev.reps || 0) + 1;
  const nextCorrect = (prev.correct || 0) + (grade === "good" || grade === "easy" ? 1 : 0);
  const nextWrong = (prev.wrong || 0) + (grade === "again" ? 1 : 0);

  // Latency bookkeeping:
  // If next interval < 1 day, DO NOT count the latency
  let lastLatencyMs = prev.lastLatencyMs ?? null;
  let avgLatencyMs   = prev.avgLatencyMs ?? null;
  let latencyCount   = prev.latencyCount ?? 0;
  let latencyHistory = Array.isArray(prev.latencyHistory) ? [...prev.latencyHistory] : [];

  if (measuredLatencyMs != null && nextMs >= MS.day) {
    lastLatencyMs = measuredLatencyMs;
    const n = (latencyCount || 0) + 1;
    const prevAvg = Number(avgLatencyMs || 0);
    avgLatencyMs = Math.round((prevAvg * (latencyCount || 0) + measuredLatencyMs) / n);
    latencyCount = n;
    latencyHistory.push(measuredLatencyMs);
    if (latencyHistory.length > 30) latencyHistory = latencyHistory.slice(-30);
  }

  // Store interval in DAYS if >= 1 day, else keep days at 0 (minutes-only schedule)
  const nextIntervalDays = nextMs >= MS.day ? nextMs / MS.day : 0;

  return {
    ...prev,
    ef: nextEF,
    interval: nextIntervalDays,
    reps: nextReps,
    reviews: nextReviews,
    correct: nextCorrect,
    wrong: nextWrong,

    due: nextDueKey,
    dueAt: nextDueAt,

    lastLatencyMs,
    avgLatencyMs,
    latencyCount,
    latencyHistory,

    penaltyDateKey,
    penaltyLevelToday,
  };
}
