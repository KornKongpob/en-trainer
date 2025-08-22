// src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Brain, CalendarCheck2, CheckCircle2, Flame,
  Headphones, Home, Moon, Sparkles, Star, Sun, Trophy, Volume2
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import Quiz from "./tabs/Quiz";
import Settings from "./tabs/Settings";
import ListeningLab from "./tabs/ListeningLab";

/* ===========================
   Small helpers
=========================== */
const last = (arr) => (Array.isArray(arr) && arr.length ? arr[arr.length - 1] : undefined);
const classNames = (...a) => a.filter(Boolean).join(" ");
const toKeyDate = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const fromKeyDate = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const todayKey = () => toKeyDate();
const nowMs = () => Date.now();
const MS = { min: 60_000, hour: 3_600_000, day: 86_400_000 };

/* Durations like 5m / 2h / 3d */
function humanizeMs(ms) {
  if (ms < MS.hour) return `${Math.max(1, Math.round(ms / MS.min))}m`;
  if (ms < MS.day) return `${Math.max(1, Math.round(ms / MS.hour))}h`;
  return `${Math.max(1, Math.round(ms / MS.day))}d`;
}

/* ===========================
   Default data
=========================== */
const DEFAULT_DECK = [
  { id: 1, en: "increase", th: "เพิ่มขึ้น", pos: "verb", example: "Prices increase during peak season.", syn: "raise,grow,rise,boost" },
  { id: 2, en: "decrease", th: "ลดลง", pos: "verb", example: "Sales decreased last quarter.", syn: "reduce,drop,decline,lower" },
  { id: 3, en: "reliable", th: "เชื่อถือได้", pos: "adjective", example: "She is a reliable colleague.", syn: "dependable,trustworthy,steady" },
  { id: 4, en: "deadline", th: "กำหนดส่งงาน", pos: "noun", example: "The deadline is on Friday.", syn: "due date,cutoff" },
  { id: 5, en: "negotiate", th: "เจรจาต่อรอง", pos: "verb", example: "We need to negotiate the price.", syn: "bargain,mediate,discuss" },
  { id: 6, en: "shipment", th: "การจัดส่ง", pos: "noun", example: "The shipment arrived late.", syn: "delivery,consignment,cargo" },
  { id: 7, en: "refund", th: "คืนเงิน", pos: "noun/verb", example: "They offered a full refund.", syn: "repay,reimburse,return" },
  { id: 8, en: "inventory", th: "สินค้าคงคลัง", pos: "noun", example: "Check the inventory weekly.", syn: "stock,goods,supplies" },
  { id: 9, en: "urgent", th: "เร่งด่วน", pos: "adjective", example: "This is an urgent request.", syn: "pressing,critical,immediate" },
  { id: 10, en: "confirm", th: "ยืนยัน", pos: "verb", example: "Please confirm the order.", syn: "verify,affirm,validate" },
];

/* ===========================
   Persistence
=========================== */
const LS_KEY = "th_en_learning_v3";
function loadState() { try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }
function saveState(state) { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {} }
function usePersistentState(defaults) {
  const [state, setState] = useState(() => loadState() ?? defaults);
  useEffect(() => { saveState(state); }, [state]);
  return [state, setState];
}

/* ===========================
   Card progress init
=========================== */
const initCardProgress = (deck) => Object.fromEntries(
  deck.map((c) => [c.id, {
    ef: 2.5,
    interval: 0,
    due: todayKey(),     // by day (legacy)
    dueAt: nowMs(),      // precise
    correct: 0,
    wrong: 0,
    reps: 0,             // SM-2 internal reps
    reviews: 0,          // total graded count
    introduced: false,
    introducedOn: null,

    // timing stats
    lastLatencyMs: null,
    avgLatencyMs: null,
    latencyCount: 0,
    latencyHistory: [],  // light ring buffer (cap 10)

    // Day-3+ "Again" penalty per day
    penaltyDateKey: null,      // YYYY-MM-DD of penalties
    penaltyLevelToday: 0,      // 0,1,2+ (reduces H/G/E previews on Day-3+)
  }])
);

/* ===========================
   SM-2 helper
=========================== */
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

/* ===========================
   Stage resolution (by calendar day)
=========================== */
function baseStageFor(prog) {
  const intro = prog?.introducedOn;
  if (!intro) return "day3plus";
  const t = todayKey();
  if (t === intro) return "day1";
  const introD = fromKeyDate(intro);
  const tD = fromKeyDate(t);
  const diffDays = Math.round((tD - introD) / MS.day);
  if (diffDays === 1) return "day2";
  return "day3plus";
}

/* ===========================
   Timing factor (Day-3+ only)
=========================== */
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

/* ===========================
   Penalty multipliers for Day-3+ (cumulative)
=========================== */
function penaltyMultiplier(level, grade) {
  if (level <= 0) return 1;
  const first = grade === "hard" ? 0.40 : 0.60;
  const subsequent = grade === "hard" ? 0.25 : 0.50;
  return first * Math.pow(subsequent, level - 1);
}

/* ===========================
   Compute Next scheduling (uses stage + timing + penalty)
=========================== */
function computeNext(progress, grade, settings, latencyHintMs) {
  const { intervals, day1, day2, timing } = settings;
  const stage = baseStageFor(progress);

  const mkDue = (deltaMs) => {
    const dueAt = nowMs() + (deltaMs || MS.day);
    return { dueAt, due: toKeyDate(new Date(dueAt)) };
  };

  // ALWAYS: "Again" reduces EF slightly and drops reps a bit.
  const dropEF = (ef, amount) => Math.max(1.3, (ef || 2.5) - amount);
  const dropReps = (reps) => Math.max(0, (reps || 0) - 1);

  // DAY 1 rules
  if (stage === "day1") {
    if (grade === "again") {
      const mins = Math.max(1, Number(day1?.againMins ?? 5));
      return { ef: dropEF(progress.ef, 0.15), interval: 0, reps: dropReps(progress.reps), reviews: progress.reviews, ...mkDue(mins * MS.min) };
    }
    if (grade === "hard") {
      const mins = Math.max(1, Number(day1?.hardMins ?? 10));
      return { ef: dropEF(progress.ef, 0.05), interval: 0, reps: Math.max(0, progress.reps || 0), reviews: progress.reviews, ...mkDue(mins * MS.min) };
    }
    if (grade === "good") {
      const step = sm2Step(progress, 4, intervals);
      return { ...step, reviews: progress.reviews, ...mkDue(Math.max(1, Number(day1?.goodDays ?? 1)) * MS.day), interval: Math.max(1, Number(day1?.goodDays ?? 1)) };
    }
    if (grade === "easy") {
      const step = sm2Step(progress, 5, intervals);
      return { ...step, reviews: progress.reviews, ...mkDue(Math.max(1, Number(day1?.easyDays ?? 2)) * MS.day), interval: Math.max(1, Number(day1?.easyDays ?? 2)) };
    }
  }

  // DAY 2 rules
  if (stage === "day2") {
    if (grade === "again") {
      const mins = Math.max(1, Number(day2?.againMins ?? 5));
      return { ef: dropEF(progress.ef, 0.15), interval: 0, reps: dropReps(progress.reps), reviews: progress.reviews, ...mkDue(mins * MS.min) };
    }
    if (grade === "hard") {
      const mins = Math.max(1, Number(day2?.hardMins ?? 15));
      return { ef: dropEF(progress.ef, 0.05), interval: 0, reps: Math.max(0, progress.reps || 0), reviews: progress.reviews, ...mkDue(mins * MS.min) };
    }
    if (grade === "good") {
      const step = sm2Step(progress, 4, intervals);
      return { ...step, reviews: progress.reviews, ...mkDue(Math.max(1, Number(day2?.goodDays ?? 1)) * MS.day), interval: Math.max(1, Number(day2?.goodDays ?? 1)) };
    }
    if (grade === "easy") {
      const step = sm2Step(progress, 5, intervals);
      return { ...step, reviews: progress.reviews, ...mkDue(Math.max(1, Number(day2?.easyDays ?? 2)) * MS.day), interval: Math.max(1, Number(day2?.easyDays ?? 2)) };
    }
  }

  // DAY 3+ rules
  if (grade === "again") {
    return { ef: dropEF(progress.ef, 0.15), interval: 0, reps: dropReps(progress.reps), reviews: progress.reviews, ...mkDue(15 * MS.min) };
  }

  const quality = grade === "hard" ? 2 : grade === "good" ? 4 : 5;
  const base = sm2Step(progress, quality, intervals);
  const tf = computeTimingFactor(
    Number.isFinite(latencyHintMs) ? latencyHintMs : (progress.lastLatencyMs ?? (settings?.timing?.fastMs ?? 5000)),
    timing
  );
  let days = Math.max(1, Math.floor(base.interval * tf));

  const today = todayKey();
  const level = (progress.penaltyDateKey === today) ? (progress.penaltyLevelToday || 0) : 0;
  const pMul = penaltyMultiplier(level, grade);
  days = Math.max(1, Math.floor(days * pMul));

  return { ef: base.ef, interval: days, reps: base.reps, reviews: progress.reviews, ...mkDue(days * MS.day) };
}

/* Preview label for buttons */
function previewLabel(progress, grade, settings) {
  const simulated = computeNext(progress, grade, settings, progress.lastLatencyMs ?? (settings?.timing?.fastMs ?? 5000));
  const delta = Math.max(1, simulated.dueAt - nowMs());
  return humanizeMs(delta);
}

/* ===========================
   TTS helper (cards): prefer Google voices if present
=========================== */
function pickBestVoice(voices, lang, preferredName) {
  const list = voices.filter(v => (v.lang || "").toLowerCase().startsWith(lang.toLowerCase()));
  if (!list.length) return null;
  if (preferredName) {
    const exact = list.find(v => (v.name || "") === preferredName);
    if (exact) return exact;
    const part = list.find(v => (v.name || "").toLowerCase().includes(preferredName.toLowerCase()));
    if (part) return part;
  }
  const byName = (s) => list.find(x => (x.name || "").toLowerCase().includes(s));
  return byName("google") || byName("microsoft") || list[0] || null;
}
function ttsSpeak(text, lang, tts) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = lang;
    const voices = synth.getVoices?.() || [];
    const prefName = lang.startsWith("th") ? tts?.thVoice : tts?.enVoice;
    const best = pickBestVoice(voices, lang, prefName);
    if (best) u.voice = best;
    u.rate = Number(tts?.rate ?? 0.92);
    u.pitch = Number(tts?.pitch ?? 1.0);
    u.volume = Number(tts?.volume ?? 1.0);
    synth.cancel(); synth.speak(u);
  } catch {}
}

/* ===========================
   App
=========================== */
export default function App() {
  const [store, setStore] = usePersistentState({
    theme: "dark",
    deck: DEFAULT_DECK,
    cards: initCardProgress(DEFAULT_DECK),
    xp: 0,
    goal: 50,
    streak: 0,
    lastActive: null,
    calendar: {},
    quizHistory: [],
    intervals: { easy: 3, good: 2, hard: 1 },
    dailyNew: 10,
    day1: { againMins: 5, hardMins: 10, goodDays: 1, easyDays: 2 },
    day2: { againMins: 5, hardMins: 15, goodDays: 1, easyDays: 2 },
    timing: { fastMs: 5000, slowMs: 25000, clampMin: 0.75, clampMax: 1.25 },
    tts: { enVoice: "", thVoice: "", rate: 0.92, pitch: 1.0, volume: 1.0, slowFirst: false }
  });

  // Patch older saves to include new keys
  useEffect(() => {
    setStore((s) => {
      const patched = { ...s };
      if (!patched.intervals) patched.intervals = { easy: 3, good: 2, hard: 1 };
      if (typeof patched.dailyNew !== "number") patched.dailyNew = 10;
      if (!patched.day1) patched.day1 = { againMins: 5, hardMins: 10, goodDays: 1, easyDays: 2 };
      if (!patched.day2) patched.day2 = { againMins: 5, hardMins: 15, goodDays: 1, easyDays: 2 };
      if (!patched.timing) patched.timing = { fastMs: 5000, slowMs: 25000, clampMin: 0.75, clampMax: 1.25 };
      if (!patched.tts) patched.tts = { enVoice: "", thVoice: "", rate: 0.92, pitch: 1.0, volume: 1.0, slowFirst: false };

      const cards = { ...(patched.cards || {}) };
      Object.keys(cards || {}).forEach((id) => {
        const c = cards[id] || {};
        if (typeof c.reps !== "number") c.reps = 0;
        if (typeof c.reviews !== "number") c.reviews = 0;
        if (typeof c.ef !== "number") c.ef = 2.5;
        if (typeof c.interval !== "number") c.interval = 0;
        if (!c.due) c.due = todayKey();
        if (typeof c.dueAt !== "number") c.dueAt = nowMs();
        if (typeof c.introduced !== "boolean") c.introduced = false;
        if (!("introducedOn" in c)) c.introducedOn = null;

        if (!("lastLatencyMs" in c)) c.lastLatencyMs = null;
        if (!("avgLatencyMs" in c)) c.avgLatencyMs = null;
        if (!("latencyCount" in c)) c.latencyCount = 0;
        if (!("latencyHistory" in c)) c.latencyHistory = [];

        if (!("penaltyDateKey" in c)) c.penaltyDateKey = null;
        if (!("penaltyLevelToday" in c)) c.penaltyLevelToday = 0;

        cards[id] = c;
      });
      patched.cards = cards;

      patched.deck = (patched.deck || []).map(d => ({ syn: "", ...d }));
      return patched;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Streak tracking on mount
  useEffect(() => {
    const today = todayKey();
    if (store.lastActive === today) return;
    if (!store.lastActive) { setStore((s) => ({ ...s, lastActive: today })); return; }
    const lastD = fromKeyDate(store.lastActive), nowD = fromKeyDate(today);
    const diff = Math.round((nowD - lastD) / MS.day);
    setStore((s) => ({ ...s, lastActive: today, streak: diff === 1 ? s.streak + 1 : diff === 0 ? s.streak : 1 }));
  }, []); // mount only

  // Theme toggle
  useEffect(() => {
    const root = document.documentElement;
    if (store.theme === "dark") root.classList.add("dark"); else root.classList.remove("dark");
  }, [store.theme]);

  // Daily introduction of new words
  useEffect(() => {
    const today = todayKey();
    const introducedToday = Object.values(store.cards || {}).filter(c => c.introducedOn === today).length;
    const need = Math.max(0, (store.dailyNew ?? 0) - introducedToday);

    if (need > 0) {
      const nextCards = { ...store.cards };
      const candidates = store.deck.filter(c => !nextCards[c.id]?.introduced).slice(0, need);
      if (candidates.length) {
        candidates.forEach((c) => {
          const prev = nextCards[c.id] ?? { ef: 2.5, interval: 0, reps: 0, reviews: 0, correct: 0, wrong: 0 };
          nextCards[c.id] = {
            ...prev,
            introduced: true,
            introducedOn: today,
            due: today,
            dueAt: nowMs(),
            interval: 0,
            reps: 0,
            reviews: 0,
            penaltyDateKey: null,
            penaltyLevelToday: 0,
          };
        });
        setStore((s) => ({ ...s, cards: nextCards }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.deck, store.dailyNew, store.lastActive]);

  const [tab, setTab] = useState("home");
  const todayXP = store.calendar[todayKey()] ?? 0;
  const goalPct = Math.min(100, Math.round((todayXP / store.goal) * 100));
  const addXP = (points) => {
    const day = todayKey();
    setStore((s) => ({
      ...s,
      xp: s.xp + points,
      calendar: { ...s.calendar, [day]: (s.calendar[day] ?? 0) + points }
    }));
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-indigo-950 via-slate-900 to-emerald-900 dark:from-slate-950 dark:via-zinc-950 dark:to-slate-900 text-slate-100">
      <Decor />
      <TopBar store={store} setStore={setStore} goalPct={goalPct} />
      <main className="max-w-6xl mx-auto px-4 pb-[calc(76px+env(safe-area-inset-bottom))] md:pb-24">
        <Nav tab={tab} setTab={setTab} />
        <AnimatePresence mode="wait">
          {tab === "home" && (
            <motion.div key="home" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <Hero />
              <Stats store={store} goalPct={goalPct} />
              <QuickStart setTab={setTab} />
              <ProgressSection store={store} />
            </motion.div>
          )}
          {tab === "flashcards" && (
            <motion.div key="flash" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <Flashcards store={store} setStore={setStore} onXP={addXP} />
            </motion.div>
          )}
          {tab === "quiz" && (
            <motion.div key="quiz" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <Quiz
                store={store}
                setStore={setStore}
                onXP={addXP}
                ttsSpeak={(text, lang) => ttsSpeak(text, lang, store.tts)}
              />
            </motion.div>
          )}
          {tab === "listen" && (
            <motion.div key="listen" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <ListeningLab store={store} onXP={addXP} />
            </motion.div>
          )}
          {tab === "settings" && (
            <motion.div key="settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <Settings store={store} setStore={setStore} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <BottomTabBar tab={tab} setTab={setTab} />
      <Footer />
    </div>
  );
}

/* ===========================
   UI Bits
=========================== */
function Decor() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-fuchsia-500/10 blur-3xl" />
      <div className="absolute top-40 -left-20 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="absolute bottom-10 right-10 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
    </div>
  );
}

function TopBar({ store, setStore, goalPct }) {
  return (
    <header className="sticky top-0 z-40 backdrop-blur bg-black/30 border-b border-white/10" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-6 text-amber-300" />
          <span className="font-semibold tracking-wide">EN Trainer</span>
        </div>
        <div className="flex items-center gap-4">
          <GoalRing pct={goalPct} />
          <div className="hidden sm:flex items-center gap-2 text-sm text-slate-300">
            <Flame className="size-4 text-orange-400" />
            <span>Streak: <b>{store.streak}</b> days</span>
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 px-3 py-1 text-sm"
            onClick={() => setStore((s) => ({ ...s, theme: s.theme === "dark" ? "light" : "dark" }))}
          >
            {store.theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />} Theme
          </button>
        </div>
      </div>
    </header>
  );
}

function GoalRing({ pct }) {
  const r = 16; const c = 2 * Math.PI * r; const off = c - (c * pct) / 100;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="drop-shadow">
      <circle cx="22" cy="22" r={r} stroke="currentColor" strokeWidth="6" className="text-white/10 fill-none" />
      <circle cx="22" cy="22" r={r} stroke="currentColor" strokeWidth="6" strokeLinecap="round" className="text-emerald-400 fill-none" style={{ strokeDasharray: c, strokeDashoffset: off, transition: "stroke-dashoffset .6s" }} />
      <text x="22" y="26" textAnchor="middle" className="fill-white text-[10px] font-semibold">{pct}%</text>
    </svg>
  );
}

function Nav({ tab, setTab }) {
  const items = [
    { id: "home", label: "Home", icon: Home },
    { id: "flashcards", label: "Flashcards", icon: BookOpen },
    { id: "quiz", label: "Quiz", icon: Brain },
    { id: "listen", label: "Listening", icon: Headphones },
    { id: "settings", label: "Settings", icon: Sparkles },
  ];
  return (
    <nav className="my-6 hidden md:grid grid-cols-2 md:grid-cols-5 gap-2">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => setTab(it.id)}
          className={classNames(
            "rounded-2xl px-4 py-3 text-sm sm:text-base border",
            tab === it.id ? "bg-emerald-500/20 border-emerald-400" : "bg-white/5 hover:bg-white/10 border-white/10"
          )}
        >
          <div className="flex items-center justify-center gap-2">
            <it.icon className="size-5" />
            <span>{it.label}</span>
          </div>
        </button>
      ))}
    </nav>
  );
}

function BottomTabBar({ tab, setTab }) {
  const items = [
    { id: "home", label: "Home", icon: Home },
    { id: "flashcards", label: "Cards", icon: BookOpen },
    { id: "quiz", label: "Quiz", icon: Brain },
    { id: "listen", label: "Listen", icon: Headphones },
    { id: "settings", label: "Settings", icon: Sparkles },
  ];
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-black/70 backdrop-blur supports-[backdrop-filter]:bg-black/40"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="max-w-6xl mx-auto grid grid-cols-5">
        {items.map((it) => {
          const Active = tab === it.id;
          return (
            <button
              key={it.id}
              onClick={() => setTab(it.id)}
              className={classNames(
                "flex flex-col items-center justify-center py-2 min-h-16 gap-1",
                Active ? "text-emerald-400" : "text-slate-200"
              )}
            >
              <it.icon className="size-5" />
              <span className="text-[11px] leading-none">{it.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-700/40 to-cyan-700/40 border border-white/10 p-6 sm:p-10">
      <motion.h1 initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: .05 }} className="text-2xl sm:text-4xl font-extrabold tracking-tight">
        Learn English with goals, motivation, and clear progress
      </motion.h1>
      <motion.p initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: .15 }} className="mt-2 text-slate-200 max-w-2xl">
        Practice every day with flashcards, quizzes, listening, and speaking. The app tracks XP, streaks, and your progress automatically.
      </motion.p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Badge icon={Trophy} text="Earn XP" />
        <Badge icon={Flame} text="Keep your streak" />
        <Badge icon={CalendarCheck2} text="Daily tracking" />
        <Badge icon={Sparkles} text="Smooth, playful UI" />
      </div>
    </section>
  );
}

function Badge({ icon: Icon, text }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs">
      <Icon className="size-4" /><span>{text}</span>
    </div>
  );
}

function Stats({ store, goalPct }) {
  const today = todayKey();
  const todayXP = store.calendar[today] ?? 0;
  const last7 = useMemo(() => {
    const arr = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = toKeyDate(d); arr.push({ day: k.slice(5), xp: store.calendar[k] ?? 0 }); }
    return arr;
  }, [store.calendar]);

  return (
    <section className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <div className="flex items-center gap-3">
          <Flame className="size-6 text-orange-400" />
          <div>
            <div className="text-sm text-slate-400">Streak</div>
            <div className="text-2xl font-bold">{store.streak} days</div>
          </div>
        </div>
      </Card>
      <Card>
        <div className="flex items-center gap-3">
          <Star className="size-6 text-yellow-300" />
          <div>
            <div className="text-sm text-slate-400">Today's goal</div>
            <div className="text-2xl font-bold">{todayXP}/{store.goal} XP</div>
          </div>
          <div className="ml-auto"><GoalRing pct={goalPct} /></div>
        </div>
      </Card>
      <Card>
        <div className="h-24 sm:h-28 w-full">
          <div className="text-sm text-slate-400 mb-1 flex items-center gap-2"><CalendarCheck2 className="size-4" /> Last 7 days</div>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={last7} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="day" hide />
              <YAxis hide domain={[0, 'dataMax + 10']} />
              <Tooltip formatter={(v) => [`${v} XP`, ""]} labelFormatter={(l) => `Date ${l}`} />
              <Line type="monotone" dataKey="xp" strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </section>
  );
}

function Card({ children }) { return (<div className="rounded-3xl border border-white/10 bg-white/5 p-4">{children}</div>); }

function QuickStart({ setTab }) {
  return (
    <section className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
      <QSItem icon={BookOpen} title="Start flashcards" desc="Review words with Thai meanings" onClick={() => setTab("flashcards")} />
      <QSItem icon={Brain} title="Take a quiz" desc="Multiple choice and typing" onClick={() => setTab("quiz")} />
      <QSItem icon={Headphones} title="Listening / Speaking" desc="TTS playback, mic recording & STT" onClick={() => setTab("listen")} />
    </section>
  );
}

function QSItem({ icon: Icon, title, desc, onClick }) {
  return (
    <button onClick={onClick} className="group rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[.02] p-5 text-left hover:border-emerald-400 transition">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-emerald-400/20 p-2"><Icon className="size-6" /></div>
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-sm text-slate-300">{desc}</div>
        </div>
      </div>
    </button>
  );
}

/* ===========================
   Flashcards (timer + penalties + previews)
=========================== */
function Flashcards({ store, setStore, onXP }) {
  const dueCards = useMemo(
    () =>
      store.deck.filter((c) => {
        const p = store.cards[c.id] ?? {};
        if (!p.introduced) return false;
        if (typeof p.dueAt === "number") return p.dueAt <= Date.now();
        return (p.due ?? todayKey()) <= todayKey();
      }),
    [store.deck, store.cards]
  );

  const [idx, setIdx] = useState(0);
  const card = dueCards[0];
  const [show, setShow] = useState(false);

  // latency capture
  const viewStartRef = useRef(null);
  const measuredLatencyRef = useRef(null);

  // reset timer + UI when card changes
  useEffect(() => {
    setShow(false);
    measuredLatencyRef.current = null;
    viewStartRef.current = Date.now();
  }, [card?.id]);

  // Clamp index when list changes
  useEffect(() => {
    if (!dueCards.length) setIdx(0);
    else if (idx > dueCards.length - 1) setIdx(dueCards.length - 1);
  }, [dueCards.length, idx]);

  if (!dueCards.length) {
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

  const leftCount = Math.max(0, dueCards.length - 1);
  const positionLabel = `1/${dueCards.length}`;
  const prog = store.cards[card.id];

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

    // compute next schedule
    const next = computeNext(prog, grade, {
      intervals: store.intervals,
      day1: store.day1,
      day2: store.day2,
      timing: store.timing,
    }, latency);

    // build updated progress
    let updated = {
      ...prog,
      ...next,
      correct: prog.correct + (grade === "good" || grade === "easy" ? 1 : 0),
      wrong: prog.wrong + (grade === "again" || grade === "hard" ? 1 : 0),
      reviews: (prog.reviews || 0) + 1,
    };

    // Day-3+ penalty logic
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

    setStore((s) => ({ ...s, cards: { ...s.cards, [card.id]: updated } }));
    onXP(grade === "good" || grade === "easy" ? 10 : 4);
    setShow(false);
    setIdx(0);
  }

  // Previews (use lastLatencyMs for Day-3+ timing hint)
  const settingsPack = { intervals: store.intervals, day1: store.day1, day2: store.day2, timing: store.timing };
  const lblAgain = previewLabel(prog, "again", settingsPack);
  const lblHard  = previewLabel(prog, "hard",  settingsPack);
  const lblGood  = previewLabel(prog, "good",  settingsPack);
  const lblEasy  = previewLabel(prog, "easy",  settingsPack);

  // "Due in" display
  const dueInText = (() => {
    const delta = Math.max(0, (prog?.dueAt ?? Date.now()) - Date.now());
    const val = delta ? humanizeMs(delta) : "0m";
    return val;
  })();

  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 min-h-[60dvh] sm:min-h-[320px] flex flex-col">
          <div className="flex items-center justify-between text-sm text-slate-300">
            <span>Card {positionLabel}</span>
            <span>Left in queue now: <b>{Math.max(0, dueCards.length - 1)}</b></span>
          </div>

          <div className="mt-2 text-4xl font-extrabold tracking-tight break-words">{card.en}</div>
          <div className="text-sm text-slate-400">{card.pos}</div>

          {!show && (
            <div className="mt-6">
              <button
                onClick={() => ttsSpeak(card.en, "en-US", store.tts)}
                className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 px-3 py-1 text-sm"
              >
                <Volume2 className="size-4" /> Listen (EN)
              </button>
            </div>
          )}

          <AnimatePresence>
            {show && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-6 space-y-2">
                <div className="text-xl">{card.th}</div>
                {card.example ? <div className="text-sm text-slate-300">Example: <i>{card.example}</i></div> : null}
                {card.syn ? <div className="text-sm text-emerald-200/90"><span className="font-semibold">Synonyms:</span> {card.syn}</div> : null}
              </motion.div>
            )}
          </AnimatePresence>

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
              <div className="text-xl font-bold">{store.cards[card.id]?.correct ?? 0}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className="text-xs text-slate-400">Wrong</div>
              <div className="text-xl font-bold">{store.cards[card.id]?.wrong ?? 0}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className="text-xs text-slate-400">EF</div>
              <div className="text-xl font-bold">{(store.cards[card.id]?.ef ?? 2.5).toFixed(2)}</div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

/* ===========================
   Progress Summary
=========================== */
function ProgressSection({ store }) {
  const days = Object.keys(store.calendar).sort();
  const totalXP = days.reduce((sum, k) => sum + (store.calendar[k] || 0), 0);
  return (
    <section className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <div className="text-sm text-slate-400 mb-1 flex items-center gap-2"><CalendarCheck2 className="size-4" /> Progress summary</div>
        <div className="text-2xl font-bold">Total {totalXP} XP</div>
      </Card>
      <Card>
        <div className="text-sm text-slate-400">Activity log</div>
        <div className="text-slate-300 text-sm">(coming soon)</div>
      </Card>
    </section>
  );
}

function Footer() {
  return (
    <footer className="hidden md:block fixed bottom-0 left-0 right-0 border-t border-white/10 bg-black/30 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 py-2 text-xs text-slate-400 flex items-center justify-between">
        <span>EN Trainer · © {new Date().getFullYear()}</span>
        <span>Built for Thai learners</span>
      </div>
    </footer>
  );
}

/* ===========================
   Dev tests (console)
=========================== */
function runDevTests() {
  try { console.log("[EN Trainer] Dev tests loaded"); } catch (e) { console.error("[EN Trainer] Dev tests failed", e); }
}
if (typeof window !== "undefined" && !window.__EN_TRAINER_TESTED__) {
  window.__EN_TRAINER_TESTED__ = true;
  runDevTests();
}
