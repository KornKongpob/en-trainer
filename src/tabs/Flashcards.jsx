// src/tabs/Flashcards.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Volume2 } from "lucide-react";

/* ========= Local helpers (self-contained; avoids white-screen) ========= */
const classNames = (...a) => a.filter(Boolean).join(" ");
const toKeyDate = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const fromKeyDate = (k) => { const [y, m, d] = String(k || "").split("-").map(Number); return new Date(y || 1970, (m || 1) - 1, d || 1); };
const todayKey = () => toKeyDate();
const nowMs = () => Date.now();
const MS = { min: 60_000, hour: 3_600_000, day: 86_400_000 };

function humanizeMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  if (ms < MS.hour) return `${Math.max(1, Math.round(ms / MS.min))}m`;
  if (ms < MS.day) return `${Math.max(1, Math.round(ms / MS.hour))}h`;
  return `${Math.max(1, Math.round(ms / MS.day))}d`;
}

function safeProgress(p) {
  // Provide sane defaults so we never crash if a card’s progress is missing
  return {
    ef: 2.5, interval: 0, reps: 0, reviews: 0, correct: 0, wrong: 0,
    introduced: false, introducedOn: null,
    due: todayKey(), dueAt: nowMs(),
    lastLatencyMs: null, avgLatencyMs: null, latencyCount: 0, latencyHistory: [],
    penaltyDateKey: null, penaltyLevelToday: 0,
    ...(p || {}),
  };
}

/* ================= SM-2 / stages / timing / penalties ================= */
function sm2Step(progress, quality, baseIntervals) {
  let { ef = 2.5, interval = 0, reps = 0 } = progress;
  ef = Math.max(1.3, ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  if (quality < 3) {
    interval = Math.max(1, Number(baseIntervals?.hard ?? 1));
    reps = 0;
  } else if (reps === 0) {
    interval = Math.max(1, Number(baseIntervals?.good ?? 2));
    reps = 1;
  } else if (reps === 1) {
    interval = Math.max(interval, Number(baseIntervals?.easy ?? 3));
    reps = 2;
  } else {
    const qMul = quality >= 5 ? 1.25 : 1.0;
    interval = Math.max(1, Math.round(interval * ef * qMul));
    reps += 1;
  }
  return { ef, interval, reps };
}

function baseStageFor(prog) {
  const p = safeProgress(prog);
  const intro = p.introducedOn;
  if (!intro) return "day3plus";
  const t = todayKey();
  if (t === intro) return "day1";
  const introD = fromKeyDate(intro);
  const tD = fromKeyDate(t);
  const diffDays = Math.round((tD - introD) / MS.day);
  if (diffDays === 1) return "day2";
  return "day3plus";
}

function computeTimingFactor(latencyMs, timing) {
  const fast = Math.max(0, Number(timing?.fastMs ?? 5000));
  const slow = Math.max(fast + 1, Number(timing?.slowMs ?? 25000));
  const clampMin = Number(timing?.clampMin ?? 0.75);
  const clampMax = Number(timing?.clampMax ?? 1.25);
  if (!Number.isFinite(latencyMs)) return 1.0;
  if (latencyMs <= fast) return clampMax;
  if (latencyMs >= slow) return clampMin;
  const t = (latencyMs - fast) / (slow - fast);
  const mul = clampMax + (clampMin - clampMax) * t;
  return Math.max(clampMin, Math.min(clampMax, mul));
}

function penaltyMultiplier(level, grade) {
  if (level <= 0) return 1;
  if (level === 1) {
    if (grade === "hard") return 0.40;
    if (grade === "good") return 0.60;
    if (grade === "easy") return 0.60;
  }
  // level >= 2
  if (grade === "hard") return 0.25;
  if (grade === "good") return 0.50;
  if (grade === "easy") return 0.50;
  return 1;
}

function computeNext(progressIn, grade, settings, latencyHintMs) {
  const progress = safeProgress(progressIn);
  const { intervals, day1, day2, timing } = settings || {};
  const stage = baseStageFor(progress);

  const mkDue = (deltaMs) => {
    const dueAt = nowMs() + (deltaMs || MS.day);
    return { dueAt, due: toKeyDate(new Date(dueAt)) };
  };
  const dropEF = (ef, amount) => Math.max(1.3, (ef || 2.5) - amount);
  const dropReps = (r) => Math.max(0, (r || 0) - 1);

  // Day 1
  if (stage === "day1") {
    if (grade === "again") return { ef: dropEF(progress.ef, 0.15), interval: 0, reps: dropReps(progress.reps), reviews: progress.reviews, ...mkDue(Math.max(1, Number(day1?.againMins ?? 5)) * MS.min) };
    if (grade === "hard")  return { ef: dropEF(progress.ef, 0.05), interval: 0, reps: progress.reps || 0, reviews: progress.reviews, ...mkDue(Math.max(1, Number(day1?.hardMins ?? 10)) * MS.min) };
    if (grade === "good")  { const s = sm2Step(progress, 4, intervals); const d = Math.max(1, Number(day1?.goodDays ?? 1)); return { ...s, interval: d, reviews: progress.reviews, ...mkDue(d * MS.day) }; }
    if (grade === "easy")  { const s = sm2Step(progress, 5, intervals); const d = Math.max(1, Number(day1?.easyDays ?? 2)); return { ...s, interval: d, reviews: progress.reviews, ...mkDue(d * MS.day) }; }
  }

  // Day 2
  if (stage === "day2") {
    if (grade === "again") return { ef: dropEF(progress.ef, 0.15), interval: 0, reps: dropReps(progress.reps), reviews: progress.reviews, ...mkDue(Math.max(1, Number(day2?.againMins ?? 5)) * MS.min) };
    if (grade === "hard")  return { ef: dropEF(progress.ef, 0.05), interval: 0, reps: progress.reps || 0, reviews: progress.reviews, ...mkDue(Math.max(1, Number(day2?.hardMins ?? 15)) * MS.min) }; // 15m
    if (grade === "good")  { const s = sm2Step(progress, 4, intervals); const d = Math.max(1, Number(day2?.goodDays ?? 1)); return { ...s, interval: d, reviews: progress.reviews, ...mkDue(d * MS.day) }; }
    if (grade === "easy")  { const s = sm2Step(progress, 5, intervals); const d = Math.max(1, Number(day2?.easyDays ?? 2)); return { ...s, interval: d, reviews: progress.reviews, ...mkDue(d * MS.day) }; }
  }

  // Day 3+: Again = fixed 15m
  if (grade === "again") {
    return { ef: dropEF(progress.ef, 0.15), interval: 0, reps: dropReps(progress.reps), reviews: progress.reviews, ...mkDue(15 * MS.min) };
  }

  // Day 3+: H/G/E = SM-2 base * timing factor * penalty multiplier (>=1d)
  const quality = grade === "hard" ? 2 : grade === "good" ? 4 : 5;
  const base = sm2Step(progress, quality, intervals || { easy: 3, good: 2, hard: 1 });
  const tf = computeTimingFactor(
    Number.isFinite(latencyHintMs) ? latencyHintMs : (progress.lastLatencyMs ?? (timing?.fastMs ?? 5000)),
    timing
  );
  let days = Math.max(1, Math.round(base.interval * tf));

  const today = todayKey();
  const level = (progress.penaltyDateKey === today) ? (progress.penaltyLevelToday || 0) : 0;
  const pMul = penaltyMultiplier(level, grade);
  days = Math.max(1, Math.round(days * pMul));

  return { ef: base.ef, interval: days, reps: base.reps, reviews: progress.reviews, ...mkDue(days * MS.day) };
}

function previewLabel(progress, grade, settings) {
  const simulated = computeNext(progress, grade, settings, progress?.lastLatencyMs ?? (settings?.timing?.fastMs ?? 5000));
  const delta = Math.max(1, (simulated?.dueAt ?? nowMs()) - nowMs());
  return humanizeMs(delta);
}

/* ============================== Component ============================== */
export default function Flashcards({ store, setStore, onXP, ttsSpeak }) {
  // Build due list safely
  const dueCards = useMemo(() => {
    const deck = Array.isArray(store?.deck) ? store.deck : [];
    const cards = store?.cards || {};
    return deck.filter((c) => {
      const p = safeProgress(cards[c.id]);
      if (!p.introduced) return false;
      if (typeof p.dueAt === "number") return p.dueAt <= nowMs();
      return (p.due ?? todayKey()) <= todayKey();
    });
  }, [store?.deck, store?.cards]);

  const [show, setShow] = useState(false);
  const card = dueCards[0] || null;
  const prog = safeProgress(card ? store?.cards?.[card.id] : null);

  // latency capture
  const viewStartRef = useRef(null);
  const measuredLatencyRef = useRef(null);

  // reset timer when card changes
  useEffect(() => {
    setShow(false);
    measuredLatencyRef.current = null;
    viewStartRef.current = Date.now();
  }, [card?.id]);

  // If nothing due
  if (!card) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-6 text-emerald-400" />
          <div>
            <div className="font-semibold">All caught up for today</div>
            <div className="text-slate-300 text-sm">Come back later or add new words.</div>
          </div>
        </div>
      </Card>
    );
  }

  // Stop timer on "Show translation"
  function onShowTranslation() {
    if (measuredLatencyRef.current == null && viewStartRef.current != null) {
      measuredLatencyRef.current = Date.now() - viewStartRef.current;
    }
    setShow(true);
  }

  function updateLatencyStats(updated, latency) {
    const hist = Array.isArray(updated.latencyHistory) ? [...updated.latencyHistory] : [];
    hist.push(latency);
    while (hist.length > 10) hist.shift();
    const count = (updated.latencyCount || 0) + 1;
    const avg = Number.isFinite(updated.avgLatencyMs) ? ((updated.avgLatencyMs * (count - 1) + latency) / count) : latency;
    return { ...updated, lastLatencyMs: latency, avgLatencyMs: avg, latencyCount: count, latencyHistory: hist };
  }

  function applyGrade(grade) {
    // stop timer if still running
    let latency = measuredLatencyRef.current;
    if (latency == null && viewStartRef.current != null) {
      latency = Date.now() - viewStartRef.current;
      measuredLatencyRef.current = latency;
    }

    // compute next (uses latency only on Day-3+ H/G/E)
    const next = computeNext(prog, grade, {
      intervals: store?.intervals,
      day1: store?.day1,
      day2: store?.day2,
      timing: store?.timing,
    }, latency);

    // updated progress
    let updated = {
      ...prog,
      ...next,
      correct: prog.correct + (grade === "good" || grade === "easy" ? 1 : 0),
      wrong: prog.wrong + (grade === "again" || grade === "hard" ? 1 : 0),
      reviews: (prog.reviews || 0) + 1,
    };

    // Day-3+ penalty tracking
    const stage = baseStageFor(prog);
    const today = todayKey();
    if (stage === "day3plus") {
      if (grade === "again") {
        const sameDay = prog.penaltyDateKey === today;
        const level = sameDay ? Math.min(10, (prog.penaltyLevelToday || 0) + 1) : 1;
        updated.penaltyDateKey = today;
        updated.penaltyLevelToday = level;
      } else {
        updated.penaltyDateKey = today;
        updated.penaltyLevelToday = 0;
      }
    } else {
      updated.penaltyDateKey = today;
      updated.penaltyLevelToday = 0;
    }

    // attach latency stats
    if (Number.isFinite(latency)) {
      updated = updateLatencyStats(updated, latency);
    }

    setStore((s) => ({ ...s, cards: { ...(s.cards || {}), [card.id]: updated } }));
    onXP?.(grade === "good" || grade === "easy" ? 10 : 4);
    setShow(false);
  }

  // Previews
  const settingsPack = { intervals: store?.intervals, day1: store?.day1, day2: store?.day2, timing: store?.timing };
  const lblAgain = previewLabel(prog, "again", settingsPack);
  const lblHard  = previewLabel(prog, "hard",  settingsPack);
  const lblGood  = previewLabel(prog, "good",  settingsPack);
  const lblEasy  = previewLabel(prog, "easy",  settingsPack);

  // "Due in" display
  const dueInText = (() => {
    const delta = Math.max(0, (prog?.dueAt ?? nowMs()) - nowMs());
    return humanizeMs(delta);
  })();

  const leftCount = Math.max(0, dueCards.length - 1);
  const positionLabel = `1/${dueCards.length}`;

  const say = (text, lang) => {
    try { if (typeof ttsSpeak === "function") return ttsSpeak(text, lang); } catch {}
    try {
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = lang || "en-US";
      const synth = window.speechSynthesis;
      synth?.cancel();
      synth?.speak(u);
    } catch {}
  };

  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 min-h-[60dvh] sm:min-h-[320px] flex flex-col">
          <div className="flex items-center justify-between text-sm text-slate-300">
            <span>Card {positionLabel}</span>
            <span>Left in queue now: <b>{leftCount}</b></span>
          </div>

          <div className="mt-2 text-4xl font-extrabold tracking-tight break-words">{card.en}</div>
          <div className="text-sm text-slate-400">{card.pos}</div>

          {!show && (
            <div className="mt-6">
              <button
                onClick={() => say(card.en, "en-US")}
                className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 px-3 py-1 text-sm"
              >
                <Volume2 className="size-4" /> Listen (EN)
              </button>
            </div>
          )}

          {show && (
            <div className="mt-6 space-y-2">
              <div className="text-xl">{card.th}</div>
              {card.example ? <div className="text-sm text-slate-300">Example: <i>{card.example}</i></div> : null}
              {card.syn ? <div className="text-sm text-emerald-200/90"><span className="font-semibold">Synonyms:</span> {card.syn}</div> : null}
            </div>
          )}

          <div className="mt-auto pt-6 space-y-3">
            <button
              onClick={onShowTranslation}
              className="w-full sm:w-auto rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 px-4 py-3 text-center"
            >
              Show translation
            </button>

            <div className="grid grid-cols-4 gap-2">
              <button onClick={() => applyGrade("again")} className="w-full rounded-xl bg-white/10 hover:bg-white/20 px-4 py-3">Again ({lblAgain})</button>
              <button onClick={() => applyGrade("hard")}  className="w-full rounded-xl bg-white/10 hover:bg-white/20 px-4 py-3">Hard ({lblHard})</button>
              <button onClick={() => applyGrade("good")}  className="w-full rounded-xl bg-amber-500/20 hover:bg-amber-500/30 px-4 py-3">Good ({lblGood})</button>
              <button onClick={() => applyGrade("easy")}  className="w-full rounded-xl bg-emerald-500/30 hover:bg-emerald-500/40 px-4 py-3">Easy ({lblEasy})</button>
            </div>

            <div className="text-xs text-slate-400 pt-1">
              Next due for this card: <b>{dueInText}</b>
            </div>
          </div>
        </div>
      </div>

      <div>
        <Card>
          <div className="text-sm text-slate-400">This word</div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white/5 p-3">
              <div className="text-xs text-slate-400">Correct</div>
              <div className="text-xl font-bold">{prog.correct ?? 0}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className="text-xs text-slate-400">Wrong</div>
              <div className="text-xl font-bold">{prog.wrong ?? 0}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className="text-xs text-slate-400">EF</div>
              <div className="text-xl font-bold">{(prog.ef ?? 2.5).toFixed(2)}</div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

/* Simple Card wrapper for consistent styling */
function Card({ children }) {
  return <div className="rounded-3xl border border-white/10 bg-white/5 p-4">{children}</div>;
}
