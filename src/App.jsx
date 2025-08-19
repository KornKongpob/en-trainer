// src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Brain, CalendarCheck2, CheckCircle2, Flame,
  Headphones, Home, Moon, Sparkles, Star, Sun, Trophy,
  Volume2, Mic, Square, Play
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import Quiz from "./tabs/Quiz";
import Settings from "./tabs/Settings";

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
const fromKeyDate = (k) => { const [y, m, d] = (k || "").split("-").map(Number); return new Date(y || 1970, (m || 1) - 1, d || 1); };
const todayKey = () => toKeyDate();
const nowMs = () => Date.now();
const MS = { min: 60_000, hour: 3_600_000, day: 86_400_000 };

/* Humanize durations like 5m / 2h / 3d */
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
const LS_KEY = "th_en_learning_v2";
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
    interval: 0,         // days (SM-2)
    due: todayKey(),     // legacy (by day)
    dueAt: nowMs(),      // precise timestamp
    correct: 0,
    wrong: 0,
    reps: 0,             // SM-2 internal reps
    reviews: 0,          // total graded count
    introduced: false,
    introducedOn: null,
    // timing stats (hidden)
    lastLatencyMs: null,
    avgLatencyMs: null,
    latencyCount: 0,
    latencyHistory: [],  // capped buffer
  }])
);

/* ===========================
   SM-2 helper (base for Day-3+)
=========================== */
function sm2Step(progress, quality, baseIntervals) {
  let { ef = 2.5, interval = 0, reps = 0 } = progress;
  // EF update (SM-2)
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
   Timing factor (Day-3+ only)
   - fast (<= fastMs) => clampMax (e.g., 1.25)
   - slow (>= slowMs) => clampMin (e.g., 0.75)
   - linear between
=========================== */
function computeTimingFactor(latencyMs, timing) {
  const fast = Math.max(0, Number(timing?.fastMs ?? 5000));
  const slow = Math.max(fast + 1, Number(timing?.slowMs ?? 25000));
  const clampMin = Number(timing?.clampMin ?? 0.75);
  const clampMax = Number(timing?.clampMax ?? 1.25);

  if (!Number.isFinite(latencyMs)) return 1.0;

  if (latencyMs <= fast) return clampMax;
  if (latencyMs >= slow) return clampMin;

  const t = (latencyMs - fast) / (slow - fast); // 0..1
  const mul = clampMax + (clampMin - clampMax) * t; // linear down
  return Math.max(clampMin, Math.min(clampMax, mul));
}

/* ===========================
   Day-based spacing
   - Day-1 & Day-2: fixed buttons
     again=minutes, hard=minutes, good=1d, easy=2d
   - Day-3+: SM-2 (quality 2/4/5) × timing factor
=========================== */
function computeNext(progress, grade, settings, latencyMs) {
  const { intervals, day1, timing } = settings;

  const introducedOn = progress?.introducedOn || todayKey();
  const introducedDate = fromKeyDate(introducedOn);
  const today = fromKeyDate(todayKey());
  const dayIndex = Math.max(0, Math.round((today - introducedDate) / MS.day)); // 0-based: Day-1 => 0

  const mkDue = (deltaMs) => {
    const dueAt = nowMs() + (deltaMs || MS.day);
    return { dueAt, due: toKeyDate(new Date(dueAt)) };
  };

  // Day 1 & Day 2: fixed menu
  if (dayIndex <= 1) {
    if (grade === "again") return { ...progress, interval: 0, ...mkDue(Math.max(1, Number(day1?.againMins ?? 5)) * MS.min) };
    if (grade === "hard")  return { ...progress, interval: 0, ...mkDue(Math.max(1, Number(day1?.hardMins  ?? 10)) * MS.min) };
    if (grade === "good")  return { ...sm2Step(progress, 4, intervals), ...mkDue(1 * MS.day), interval: 1 };
    if (grade === "easy")  return { ...sm2Step(progress, 5, intervals), ...mkDue(2 * MS.day), interval: 2 };
  }

  // Day 3+ : SM-2 base × timing factor
  if (grade === "again") {
    // keep "again" as short minutes even Day-3+
    const mins = Math.max(1, Number(day1?.againMins ?? 5));
    return { ...progress, ef: Math.max(1.3, (progress.ef || 2.5) - 0.15), interval: 0, reps: Math.max(0, (progress.reps || 0) - 1), ...mkDue(mins * MS.min) };
  }

  const q = grade === "hard" ? 2 : grade === "good" ? 4 : 5;
  const base = sm2Step(progress, q, intervals); // base interval in days
  const factor = computeTimingFactor(latencyMs, timing); // multiplier 0.75..1.25 by default
  const nextDays = Math.max(1, Math.round(base.interval * factor));

  return { ef: base.ef, interval: nextDays, reps: base.reps, ...mkDue(nextDays * MS.day) };
}

/* Preview label for buttons (non-mutating; timing factor ignored for preview) */
function previewLabel(progress, grade, settings) {
  const simulated = computeNext(progress, grade, settings, undefined);
  const delta = Math.max(1, simulated.dueAt - nowMs());
  return humanizeMs(delta);
}

/* ===========================
   TTS helper
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
    intervals: { easy: 3, good: 2, hard: 1 }, // base days for SM-2
    dailyNew: 10,
    day1: { againMins: 5, hardMins: 10, goodDays: 1, easyDays: 2 },
    timing: { fastMs: 5000, slowMs: 25000, clampMin: 0.75, clampMax: 1.25 }, // new
    tts: {
      enVoice: "", thVoice: "",
      rate: 0.92, pitch: 1.0, volume: 1.0, slowFirst: false
    }
  });

  // Patch older saves to include new keys
  useEffect(() => {
    setStore((s) => {
      const patched = { ...s };

      if (!patched.intervals) patched.intervals = { easy: 3, good: 2, hard: 1 };
      if (typeof patched.dailyNew !== "number") patched.dailyNew = 10;
      if (!patched.day1) patched.day1 = { againMins: 5, hardMins: 10, goodDays: 1, easyDays: 2 };
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
        if (typeof c.dueAt !== "number") c.dueAt = nowMs(); // add precise timer
        if (typeof c.introduced !== "boolean") c.introduced = false;
        if (!("introducedOn" in c)) c.introducedOn = null;
        if (!("lastLatencyMs" in c)) c.lastLatencyMs = null;
        if (!("avgLatencyMs" in c)) c.avgLatencyMs = null;
        if (!("latencyCount" in c)) c.latencyCount = 0;
        if (!("latencyHistory" in c)) c.latencyHistory = [];
        cards[id] = c;
      });
      patched.cards = cards;

      // Ensure each deck item has syn field
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
            dueAt: nowMs(), // ready now
            interval: 0,
            reps: 0,
            reviews: 0,
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
   Flashcards  (Day-based + timing)
=========================== */
function Flashcards({ store, setStore, onXP }) {
  const dueCards = useMemo(
    () =>
      store.deck.filter((c) => {
        const p = store.cards[c.id] ?? {};
        if (!p.introduced) return false;
        if (typeof p.dueAt === "number") return p.dueAt <= nowMs();
        return (p.due ?? todayKey()) <= todayKey();
      }),
    [store.deck, store.cards]
  );

  const [idx, setIdx] = useState(0);
  const card = dueCards[0];
  const [show, setShow] = useState(false);

  // latency timer
  const latencyStartRef = useRef(null);

  // Reset translation and start timer when card changes
  useEffect(() => {
    setShow(false);
    latencyStartRef.current = nowMs();
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

  function applyGrade(grade) {
    const latencyMs = latencyStartRef.current ? Math.max(0, nowMs() - latencyStartRef.current) : null;

    const next = computeNext(prog, grade, {
      intervals: store.intervals,
      day1: store.day1,
      timing: store.timing,
    }, latencyMs);

    // timing stats update (hidden)
    const prevAvg = prog.avgLatencyMs || 0;
    const prevN = prog.latencyCount || 0;
    const newN = Number.isFinite(latencyMs) ? prevN + 1 : prevN;
    const newAvg = Number.isFinite(latencyMs)
      ? Math.round((prevAvg * prevN + latencyMs) / newN)
      : prevAvg;

    const updated = {
      ...prog,
      ...next,
      correct: prog.correct + (grade === "good" || grade === "easy" ? 1 : 0),
      wrong: prog.wrong + (grade === "again" || grade === "hard" ? 1 : 0),
      reviews: (prog.reviews || 0) + 1,
      lastLatencyMs: latencyMs,
      avgLatencyMs: newAvg || null,
      latencyCount: newN,
      latencyHistory: Number.isFinite(latencyMs)
        ? [...(prog.latencyHistory || []).slice(-19), latencyMs]
        : (prog.latencyHistory || []),
    };

    setStore((s) => ({ ...s, cards: { ...s.cards, [card.id]: updated } }));
    onXP(grade === "good" || grade === "easy" ? 10 : 4);
    setShow(false);
    setIdx(0);
    latencyStartRef.current = nowMs(); // start timer for next card
  }

  // Previews for button labels (timing not applied to preview)
  const settingsPack = { intervals: store.intervals, day1: store.day1, timing: store.timing };
  const lblAgain = previewLabel(prog, "again", settingsPack);
  const lblHard  = previewLabel(prog, "hard",  settingsPack);
  const lblGood  = previewLabel(prog, "good",  settingsPack);
  const lblEasy  = previewLabel(prog, "easy",  settingsPack);

  // "Due in" display
  const dueInText = (() => {
    const delta = Math.max(0, (prog?.dueAt ?? nowMs()) - nowMs());
    const val = delta ? humanizeMs(delta) : "0m";
    return val;
  })();

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
              onClick={() => setShow(true)}
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

/* ===========================
   Listening Lab (uses improved TTS)
=========================== */
function ListeningLab({ store, onXP }) {
  const [source, setSource] = useState("deck");
  const firstId = store.deck[0]?.id ?? null;
  const [selectedId, setSelectedId] = useState(firstId);
  const [customText, setCustomText] = useState("");
  const [recognized, setRecognized] = useState("");
  const [scorePct, setScorePct] = useState(null);
  const audioRef = useRef(null);

  const [recording, setRecording] = useState(false);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [audioURL, setAudioURL] = useState(null);

  const Recognition =
    typeof window !== "undefined"
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;
  const supportsSTT = !!Recognition;

  const expected = useMemo(() => {
    if (source === "custom") return customText.trim();
    const card = store.deck.find((d) => d.id === selectedId);
    return card?.en ?? "";
  }, [source, customText, store.deck, selectedId]);

  function normalize(s) { return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim(); }
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
    return dp[m][n];
  }
  function scoreInput(input) {
    const A = normalize(expected);
    const B = normalize(input || "");
    if (!A || !B) { setScorePct(null); return; }
    const dist = levenshtein(A, B);
    const denom = Math.max(A.length, B.length) || 1;
    const pct = Math.max(0, Math.round((1 - dist / denom) * 100));
    setScorePct(pct);
    if (pct >= 85) onXP(12); else onXP(5);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data && e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioURL(url);
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      setRecording(true);
    } catch {
      alert("Microphone not available.");
    }
  }
  function stopRecording() { try { recorderRef.current && recorderRef.current.stop(); } catch {} setRecording(false); }

  function sttOnce() {
    if (!supportsSTT) return;
    const rec = new Recognition();
    try { rec.lang = "en-US"; } catch {}
    rec.interimResults = false;
    try { rec.maxAlternatives = 1; } catch {}
    rec.onresult = (ev) => {
      const text = ev?.results?.[0]?.[0]?.transcript || "";
      setRecognized(text);
      scoreInput(text);
    };
    rec.onerror = () => {};
    rec.start();
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold">Listening & Speaking Lab</div>
        <div className="text-xs text-slate-400">TTS playback · mic recording · optional STT</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="mb-2 text-sm">Source</div>
          <div className="flex gap-2 mb-3">
            <button
              className={classNames("px-3 py-2 rounded", source==="deck"?"bg-emerald-500/30":"bg-white/10 hover:bg-white/20")}
              onClick={()=>setSource("deck")}
            >From deck</button>
            <button
              className={classNames("px-3 py-2 rounded", source==="custom"?"bg-emerald-500/30":"bg-white/10 hover:bg-white/20")}
              onClick={()=>setSource("custom")}
            >Custom</button>
          </div>

          {source === "deck" ? (
            <div className="flex flex-col gap-2">
              <label className="text-sm">Choose word</label>
              <select
                className="rounded p-2 bg-white text-black"
                value={selectedId ?? ""}
                onChange={(e)=>setSelectedId(Number(e.target.value))}
              >
                {store.deck.map((d)=>(<option key={d.id} value={d.id}>{d.en} — {d.th}</option>))}
              </select>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="text-sm">Custom English text</label>
              <textarea
                className="rounded p-2 bg-white text-black placeholder-slate-500"
                rows={3}
                placeholder="Type a sentence to practice"
                value={customText}
                onChange={(e)=>setCustomText(e.target.value)}
              />
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={()=> ttsSpeak(expected || "", "en-US", store.tts)} className="inline-flex items-center gap-2 rounded bg-white/10 px-3 py-2 hover:bg-white/20">
              <Volume2 className="size-4" /> Play TTS
            </button>

            {!recording ? (
              <button onClick={startRecording} className="inline-flex items-center gap-2 rounded bg-emerald-500/20 px-3 py-2 hover:bg-emerald-500/30">
                <Mic className="size-4" /> Record
              </button>
            ) : (
              <button onClick={stopRecording} className="inline-flex items-center gap-2 rounded bg-rose-500/20 px-3 py-2 hover:bg-rose-500/30">
                <Square className="size-4" /> Stop
              </button>
            )}

            <button
              onClick={()=>{ if (audioRef.current && audioURL) { audioRef.current.currentTime = 0; audioRef.current.play(); } }}
              disabled={!audioURL}
              className={classNames("inline-flex items-center gap-2 rounded px-3 py-2", audioURL ? "bg-white/10 hover:bg-white/20" : "bg-white/5 cursor-not-allowed")}
            >
              <Play className="size-4" /> Playback
            </button>

            <button onClick={()=> sttOnce()} disabled={!supportsSTT} className={classNames("inline-flex items-center gap-2 rounded px-3 py-2", supportsSTT ? "bg-white/10 hover:bg-white/20" : "bg-white/5 cursor-not-allowed")}>
              STT (English)
            </button>
          </div>

          <audio ref={audioRef} src={audioURL ?? undefined} className="hidden" controls />

          <div className="mt-4">
            <div className="text-sm text-slate-400 mb-1">Recognized text (or type your attempt)</div>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded p-2 bg-white text-black placeholder-slate-500"
                value={recognized}
                onChange={(e)=>setRecognized(e.target.value)}
                placeholder="If STT is unavailable, type what you heard"
              />
              <button onClick={()=> scoreInput(recognized)} className="rounded bg-emerald-500 px-4 py-2 hover:bg-emerald-600">Check</button>
            </div>
            <div className="text-sm text-slate-300 mt-2">
              Target: <i>{expected || "(empty)"}</i>
            </div>
            {scorePct !== null && (
              <div className="mt-2 text-sm">
                Similarity: <b>{scorePct}%</b> {scorePct >= 85 ? "✅ Great!" : "✨ Keep practicing"}
              </div>
            )}
          </div>
        </div>

        <div>
          <Card>
            <div className="text-sm text-slate-400">Tips</div>
            <ul className="mt-2 text-sm list-disc pl-5 space-y-1 text-slate-300">
              <li>Click <b>Play TTS</b> to hear the sentence.</li>
              <li>Use <b>Record</b> to capture your voice, then <b>Playback</b>.</li>
              <li>If your browser supports it, use <b>STT</b> to transcribe what you say.</li>
              <li>Hit <b>Check</b> to score your attempt and earn XP.</li>
            </ul>
          </Card>
        </div>
      </div>
    </Card>
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
  try {
    console.log("[EN Trainer] Dev tests loaded");
  } catch (e) {
    console.error("[EN Trainer] Dev tests failed", e);
  }
}
if (typeof window !== "undefined" && !window.__EN_TRAINER_TESTED__) {
  window.__EN_TRAINER_TESTED__ = true;
  runDevTests();
}
