// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Brain, CalendarCheck2, Flame,
  Headphones, Home, Moon, Sparkles, Star, Sun, Trophy,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

import Flashcards from "./tabs/Flashcards";
import Quiz from "./tabs/Quiz";
import Settings from "./tabs/Settings";
import ListeningLab from "./tabs/ListeningLab";

/* ===========================
   Small helpers
=========================== */
const classNames = (...a) => a.filter(Boolean).join(" ");
const toKeyDate = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const fromKeyDate = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const todayKey = () => toKeyDate();
const MS = { min: 60_000, hour: 3_600_000, day: 86_400_000 };

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
   App
=========================== */
export default function App() {
  const [store, setStore] = usePersistentState({
    theme: "dark",
    deck: DEFAULT_DECK,
    cards: {},                 // will be created when introduced
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
    penalties: {
      day3AgainMins: 15,
      l1: { hard: 0.40, good: 0.60, easy: 0.60 },
      l2plus: { hard: 0.25, good: 0.50, easy: 0.50 },
      maxLevel: 10,
      compoundAfterL1: false,
    },
    tts: {
      enVoice: "", thVoice: "",
      rate: 0.92, pitch: 1.0, volume: 1.0, slowFirst: false,
      usePiper: false,
      piperVoiceId: "en_US-hfc_female-medium",
    },
  });

  // Patch older saves to include new keys/fields
  useEffect(() => {
    setStore((s) => {
      const p = { ...s };
      if (!p.intervals) p.intervals = { easy: 3, good: 2, hard: 1 };
      if (typeof p.dailyNew !== "number") p.dailyNew = 10;
      if (!p.day1) p.day1 = { againMins: 5, hardMins: 10, goodDays: 1, easyDays: 2 };
      if (!p.day2) p.day2 = { againMins: 5, hardMins: 15, goodDays: 1, easyDays: 2 };
      if (!p.timing) p.timing = { fastMs: 5000, slowMs: 25000, clampMin: 0.75, clampMax: 1.25 };
      if (!p.penalties) {
        p.penalties = {
          day3AgainMins: 15,
          l1: { hard: 0.40, good: 0.60, easy: 0.60 },
          l2plus: { hard: 0.25, good: 0.50, easy: 0.50 },
          maxLevel: 10,
          compoundAfterL1: false,
        };
      }
      if (!p.tts) {
        p.tts = { enVoice: "", thVoice: "", rate: 0.92, pitch: 1.0, volume: 1.0, slowFirst: false, usePiper: false, piperVoiceId: "en_US-hfc_female-medium" };
      }
      if (!("usePiper" in p.tts)) p.tts.usePiper = false;
      if (!p.tts.piperVoiceId) p.tts.piperVoiceId = "en_US-hfc_female-medium";
      // ensure deck has syn key
      p.deck = (p.deck || []).map(d => ({ syn: "", ...d }));
      // ensure cards object exists
      if (!p.cards) p.cards = {};
      return p;
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

  // Daily introduction of new words (create per-card progress lazily)
  useEffect(() => {
    const today = todayKey();
    const introducedToday = Object.values(store.cards || {}).filter(c => c.introducedOn === today).length;
    const need = Math.max(0, (store.dailyNew ?? 0) - introducedToday);

    if (need > 0) {
      const nextCards = { ...store.cards };
      const candidates = store.deck.filter(c => !nextCards[c.id]?.introduced).slice(0, need);
      if (candidates.length) {
        candidates.forEach((c) => {
          const prev = nextCards[c.id] ?? {
            ef: 2.5, interval: 0, reps: 0, reviews: 0, correct: 0, wrong: 0,
            lastLatencyMs: null, avgLatencyMs: null, latencyCount: 0, latencyHistory: [],
            penaltyDateKey: null, penaltyLevelToday: 0,
          };
          nextCards[c.id] = {
            ...prev,
            introduced: true,
            introducedOn: today,
            due: today,
            dueAt: Date.now(), // ready now
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
              <Flashcards
                store={store}
                setStore={setStore}
                onXP={addXP}
                ttsSpeak={(text, lang) => ttsSpeak(text, lang, store.tts)}
              />
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
   TTS helper (async, pre-warm voices)
=========================== */
function pickBestVoice(voices, lang, preferredKey) {
  const list = voices.filter(v => (v.lang || "").toLowerCase().startsWith(lang.toLowerCase()));
  const exact = preferredKey ? list.find(v => `${v.name}__${v.lang}` === preferredKey) : null;
  if (exact) return exact;

  const score = (v) => {
    const n = (v.name || "").toLowerCase();
    let s = 0;
    if (n.startsWith("google")) s += 5;
    if (n.includes("google")) s += 3;
    if (/en-us/i.test(v.lang)) s += 2;
    if (/en-gb|en-au|en-in/i.test(v.lang)) s += 1;
    if (n.includes("enhanced")) s += 1;
    return s;
  };
  const best = (list.length ? list : voices).slice().sort((a,b)=>score(b)-score(a))[0];
  return best || null;
}

async function ensureVoicesReady() {
  const synth = window.speechSynthesis;
  if (!synth) return [];
  let voices = synth.getVoices?.() || [];
  if (voices.length) return voices;

  // small delay then retry
  await new Promise(r => setTimeout(r, 50));
  voices = synth.getVoices?.() || [];
  if (voices.length) return voices;

  // wait for onvoiceschanged or 1s timeout
  await new Promise(resolve => {
    const timer = setTimeout(resolve, 1000);
    const prev = synth.onvoiceschanged;
    synth.onvoiceschanged = () => {
      clearTimeout(timer);
      if (prev) { try { prev(); } catch {} }
      resolve();
    };
  });
  return synth.getVoices?.() || [];
}

async function ttsSpeak(text, lang, tts) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;

    const voices = await ensureVoicesReady();
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = lang;

    const preferredKey = lang?.toLowerCase().startsWith("th") ? tts?.thVoice : tts?.enVoice;
    const best = pickBestVoice(voices, lang, preferredKey);
    if (best) u.voice = best;

    u.rate = Number(tts?.rate ?? 0.92);
    u.pitch = Number(tts?.pitch ?? 1.0);
    u.volume = Number(tts?.volume ?? 1.0);

    synth.cancel(); // avoid stacking
    synth.speak(u);
  } catch (e) {
    console.warn("System TTS failed:", e);
  }
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
            <div className="text-2xl font-bold">{store.calendar[today] ?? 0}/{store.goal} XP</div>
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
