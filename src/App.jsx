import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  Brain,
  CalendarCheck2,
  CheckCircle2,
  Edit,
  Flame,
  Headphones,
  Home,
  Languages,
  Moon,
  Sparkles,
  Star,
  Sun,
  Trophy,
  Volume2,
  Mic,
  Square,
  Play,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

/* =============================================
   Helpers
============================================= */
const last = (arr) => (Array.isArray(arr) && arr.length ? arr[arr.length - 1] : undefined);
const classNames = (...a) => a.filter(Boolean).join(" ");

/* =============================================
   Data & Utilities
============================================= */
const DEFAULT_DECK = [
  { id: 1, en: "increase", th: "เพิ่มขึ้น", pos: "verb", example: "Prices increase during peak season." },
  { id: 2, en: "decrease", th: "ลดลง", pos: "verb", example: "Sales decreased last quarter." },
  { id: 3, en: "reliable", th: "เชื่อถือได้", pos: "adjective", example: "She is a reliable colleague." },
  { id: 4, en: "deadline", th: "กำหนดส่งงาน", pos: "noun", example: "The deadline is on Friday." },
  { id: 5, en: "negotiate", th: "เจรจาต่อรอง", pos: "verb", example: "We need to negotiate the price." },
  { id: 6, en: "shipment", th: "การจัดส่ง", pos: "noun", example: "The shipment arrived late." },
  { id: 7, en: "refund", th: "คืนเงิน", pos: "noun/verb", example: "They offered a full refund." },
  { id: 8, en: "inventory", th: "สินค้าคงคลัง", pos: "noun", example: "Check the inventory weekly." },
  { id: 9, en: "urgent", th: "เร่งด่วน", pos: "adjective", example: "This is an urgent request." },
  { id: 10, en: "confirm", th: "ยืนยัน", pos: "verb", example: "Please confirm the order." },
];

const LS_KEY = "th_en_learning_v2";
const localDateKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const dateFromKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const todayKey = () => localDateKey();

function loadState() { try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }
function saveState(state) { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {} }
function usePersistentState(defaults) {
  const [state, setState] = useState(() => loadState() ?? defaults);
  useEffect(() => { saveState(state); }, [state]);
  return [state, setState];
}

function speak(text, lang = "en-US") {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {}
}

function parseCSV(text) {
  const t = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = [];
  let i = 0, field = '', row = [], inQuotes = false;
  while (i < t.length) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; } }
      else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); lines.push(row); row = []; field = ''; }
      else { field += c; }
    }
    i++;
  }
  if (field.length || row.length) { row.push(field); lines.push(row); }
  if (!lines.length) return [];
  const header = lines[0].map(h => h.trim().toLowerCase());
  const idx = { en: header.indexOf('en'), th: header.indexOf('th'), pos: header.indexOf('pos'), example: header.indexOf('example') };
  if (idx.en === -1 || idx.th === -1) return [];
  return lines.slice(1).map(cols => ({
    en: (cols[idx.en] ?? '').trim(),
    th: (cols[idx.th] ?? '').trim(),
    pos: (idx.pos !== -1 ? cols[idx.pos] : 'noun')?.trim() || 'noun',
    example: (idx.example !== -1 ? cols[idx.example] : '')?.trim() || ''
  })).filter(r => r.en && r.th);
}

/* =============================================
   SRS: SM-2 EF + user-defined early intervals
============================================= */
const initCardProgress = (deck) => Object.fromEntries(
  deck.map((c) => [c.id, {
    ef: 2.5,
    interval: 0,
    due: todayKey(),
    correct: 0,
    wrong: 0,
    reps: 0,
    introduced: false,
    introducedOn: null,
  }])
);

// quality: 2 (hard), 4 (good), 5 (easy/perfect)
function scheduleNext(progress, quality, intervals) {
  let { ef, interval, reps = 0 } = progress;

  // EF update per SM-2
  ef = Math.max(1.3, ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

  if (quality < 3) { // failure → relearn
    interval = Math.max(1, Number(intervals?.hard ?? 1));
    reps = 0;
  } else if (reps === 0) { // first success
    interval = Math.max(1, Number(intervals?.good ?? 2));
    reps = 1;
  } else if (reps === 1) { // second success
    interval = Math.max(interval, Number(intervals?.easy ?? 3));
    reps = 2;
  } else { // later → grow multiplicatively
    const qMul = quality >= 5 ? 1.25 : 1.0; // reward perfect recall
    interval = Math.max(1, Math.round(interval * ef * qMul));
    reps += 1;
  }

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + interval);
  return { ef, interval, due: localDateKey(nextDate), reps };
}

/* =============================================
   App
============================================= */
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
    dailyNew: 10, // introduce up to N new words each day
  });

  // Patch older saves
  useEffect(() => {
    setStore((s) => {
      const patched = { ...s };
      if (!patched.intervals) patched.intervals = { easy: 3, good: 2, hard: 1 };
      if (typeof patched.dailyNew !== "number") patched.dailyNew = 10;
      const cards = { ...(patched.cards || {}) };
      Object.keys(cards || {}).forEach((id) => {
        const c = cards[id] || {};
        if (typeof c.reps !== 'number') c.reps = 0;
        if (typeof c.ef !== 'number') c.ef = 2.5;
        if (typeof c.interval !== 'number') c.interval = 0;
        if (!c.due) c.due = todayKey();
        if (typeof c.introduced !== 'boolean') c.introduced = false;
        if (!('introducedOn' in c)) c.introducedOn = null;
        cards[id] = c;
      });
      patched.cards = cards;
      return patched;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Streak tracking
  useEffect(() => {
    const today = todayKey();
    if (store.lastActive === today) return;
    if (!store.lastActive) { setStore((s) => ({ ...s, lastActive: today })); return; }
    const lastD = dateFromKey(store.lastActive), now = dateFromKey(today);
    const diff = Math.round((now - lastD) / (1000 * 60 * 60 * 24));
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
          const prev = nextCards[c.id] ?? { ef: 2.5, interval: 0, reps: 0, correct: 0, wrong: 0 };
          nextCards[c.id] = {
            ...prev,
            introduced: true,
            introducedOn: today,
            due: today,
            interval: 0,
            reps: 0,
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
  function addXP(points) {
    const day = todayKey();
    setStore((s) => ({
      ...s,
      xp: s.xp + points,
      calendar: { ...s.calendar, [day]: (s.calendar[day] ?? 0) + points }
    }));
  }

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
              <Quiz store={store} setStore={setStore} onXP={addXP} />
            </motion.div>
          )}
          {tab === "listen" && (
            <motion.div key="listen" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <ListeningLab store={store} onXP={addXP} />
            </motion.div>
          )}
          {tab === "custom" && (
            <motion.div key="custom" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <ContentManager store={store} setStore={setStore} />
            </motion.div>
          )}
          {tab === "manage" && (
            <motion.div key="manage" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <ManageWords store={store} setStore={setStore} />
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

/* =============================================
   UI Bits
============================================= */
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
    <header className="sticky top-0 z-40 backdrop-blur bg-black/30 border-b border-white/10">
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
    { id: "custom", label: "Add Words", icon: Languages },
    { id: "manage", label: "Manage Words", icon: Edit },
    { id: "settings", label: "Settings", icon: Sparkles },
  ];
  return (
    <nav className="my-6 hidden md:grid grid-cols-2 md:grid-cols-7 gap-2">
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
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = localDateKey(d); arr.push({ day: k.slice(5), xp: store.calendar[k] ?? 0 }); }
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

function Flashcards({ store, setStore, onXP }) {
  const dueCards = useMemo(() =>
    store.deck.filter((c) => {
      const prog = store.cards[c.id] ?? {};
      return !!prog.introduced && (prog.due ?? todayKey()) <= todayKey();
    }),
    [store.deck, store.cards]
  );
  const [idx, setIdx] = useState(0);
  const [show, setShow] = useState(false);
  const card = dueCards[idx];

  useEffect(() => { setShow(false); }, [idx]);

  if (!dueCards.length) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-6 text-emerald-400" />
          <div>
            <div className="font-semibold">All caught up for today</div>
            <div className="text-slate-300 text-sm">Come back tomorrow or add new words.</div>
          </div>
        </div>
      </Card>
    );
  }

  function grade(quality) {
    const prog = store.cards[card.id];
    const next = scheduleNext(prog, quality, store.intervals);
    const updated = { ...prog, ...next, correct: prog.correct + (quality >= 3 ? 1 : 0), wrong: prog.wrong + (quality < 3 ? 1 : 0) };
    setStore((s) => ({ ...s, cards: { ...s.cards, [card.id]: updated } }));
    onXP(quality >= 3 ? 10 : 4);
    if (idx < dueCards.length - 1) setIdx(idx + 1); else setIdx(0);
  }

  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 min-h-[60dvh] sm:min-h-[320px] flex flex-col">
          <div className="text-sm text-slate-300">Card {idx + 1}/{dueCards.length}</div>
          <div className="mt-2 text-4xl font-extrabold tracking-tight">{card.en}</div>
          <div className="text-sm text-slate-400">{card.pos}</div>
          {!show && (
            <div className="mt-6">
              <button onClick={() => speak(card.en, "en-US")} className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 px-3 py-1 text-sm">
                <Volume2 className="size-4" /> Listen (EN)
              </button>
            </div>
          )}
          <AnimatePresence>
            {show && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-6">
                <div className="text-xl">{card.th}</div>
                <div className="text-sm text-slate-300 mt-2">Example: <i>{card.example}</i></div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="mt-auto pt-6 flex flex-wrap gap-2">
            <button onClick={() => setShow(true)} className="rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 px-4 py-2">Show translation</button>
            <div className="ml-auto flex gap-2">
              <button onClick={() => grade(2)} className="rounded-xl bg-white/10 hover:bg-white/20 px-4 py-2">Hard</button>
              <button onClick={() => grade(4)} className="rounded-xl bg-amber-500/20 hover:bg-amber-500/30 px-4 py-2">Good</button>
              <button onClick={() => grade(5)} className="rounded-xl bg-emerald-500/30 hover:bg-emerald-500/40 px-4 py-2">Easy</button>
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
              <div className="text-xs text-slate-400">Due in</div>
              <div className="text-xl font-bold">{store.cards[card.id]?.interval ?? 0} d</div>
            </div>
          </div>
        </Card>
      </div>
    </section>
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

function Quiz({ store, setStore, onXP }) {
  const [mode, setMode] = useState("mc"); // mc | type
  const [dir, setDir] = useState("en-th"); // en-th | th-en
  const [count, setCount] = useState(10);
  const [started, setStarted] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [questions, setQuestions] = useState([]);
  const canStart = store.deck.length >= Math.min(4, count);

  function shuffle(arr){ return [...arr].sort(() => Math.random() - 0.5); }
  function pickN(arr,n){ return shuffle(arr).slice(0, n); }

  function buildQuestions() {
    const base = pickN(store.deck, Math.min(count, store.deck.length));
    const qs = base.map((item) => {
      const prompt = dir === "en-th" ? item.en : item.th;
      const answer = dir === "en-th" ? item.th : item.en;
      if (mode === "mc") {
        const pool = store.deck.filter((d) => d.id !== item.id).map((d) => dir === "en-th" ? d.th : d.en);
        const distractors = pickN(pool, 3);
        const options = shuffle([answer, ...distractors]);
        return { type: "mc", prompt, answer, options, item };
      }
      return { type: "type", prompt, answer, item };
    });
    setQuestions(qs);
  }

  function start() {
    buildQuestions();
    setScore(0); setQIndex(0); setDone(false); setStarted(true);
  }

  function submitMC(opt){
    const q = questions[qIndex];
    const correct = opt === q.answer;
    if (correct) { setScore((s)=>s+1); onXP(6); } else { onXP(2); }
    next();
  }

  function submitType(e){
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const val = String(form.get("ans") || "").trim().toLowerCase();
    const q = questions[qIndex];
    const correct = val === String(q.answer).trim().toLowerCase();
    if (correct) { setScore((s)=>s+1); onXP(8); } else { onXP(2); }
    e.currentTarget.reset();
    next();
  }

  function next(){
    if (qIndex + 1 >= questions.length){
      setDone(true); setStarted(false);
      const total = questions.length; const correct = score + 0;
      const accuracy = total ? Math.round((correct / total) * 100) : 0;
      const entry = { date: new Date().toISOString(), mode, dir, total, correct, accuracy };
      setStore((s)=> ({ ...s, quizHistory: [...(s.quizHistory||[]), entry] }));
      return;
    }
    setQIndex((i)=> i+1);
  }

  if (!started && !done) {
    return (
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold">Quiz</div>
          <div className="text-xs text-slate-400">Choose mode and start</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-sm mb-1">Mode</div>
            <div className="flex gap-2">
              <button className={classNames("px-3 py-2 rounded", mode==="mc"?"bg-emerald-500/30":"bg-white/10 hover:bg-white/20")} onClick={()=>setMode("mc")}>Multiple choice</button>
              <button className={classNames("px-3 py-2 rounded", mode==="type"?"bg-emerald-500/30":"bg-white/10 hover:bg-white/20")} onClick={()=>setMode("type")}>Type answer</button>
            </div>
          </div>
          <div>
            <div className="text-sm mb-1">Direction</div>
            <div className="flex gap-2">
              <button className={classNames("px-3 py-2 rounded", dir==="en-th"?"bg-emerald-500/30":"bg-white/10 hover:bg-white/20")} onClick={()=>setDir("en-th")}>EN → TH</button>
              <button className={classNames("px-3 py-2 rounded", dir==="th-en"?"bg-emerald-500/30":"bg-white/10 hover:bg-white/20")} onClick={()=>setDir("th-en")}>TH → EN</button>
            </div>
          </div>
          <div>
            <div className="text-sm mb-1">Number of questions</div>
            <input
              type="number" min={5} max={50} step={5} value={count}
              onChange={(e)=>setCount(Number(e.target.value))}
              className="w-full rounded p-2 bg-white text-black placeholder-slate-500"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            disabled={!canStart}
            onClick={start}
            className={classNames("px-4 py-2 rounded", canStart?"bg-emerald-500 hover:bg-emerald-600":"bg-white/10 cursor-not-allowed")}
          >
            Start
          </button>
          {!canStart && <span className="text-xs text-rose-300">Need at least 4 words</span>}
        </div>
        {!!store.quizHistory?.length && (
          <div className="mt-6">
            <div className="text-sm text-slate-400 mb-2">Recent quiz history</div>
            <ul className="space-y-1 text-sm">
              {store.quizHistory.slice(-5).reverse().map((h, i)=>(
                <li key={i} className="flex justify-between bg-white/5 rounded px-3 py-2">
                  <span>{new Date(h.date).toLocaleString()} · {h.mode} · {h.dir}</span>
                  <span>{h.correct}/{h.total} ({h.accuracy}%)</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    );
  }

  if (started) {
    const q = questions[qIndex];
    return (
      <Card>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-slate-400">Question {qIndex+1}/{questions.length}</div>
          <div className="text-sm">Score: <b>{score}</b></div>
        </div>
        <div className="text-xl font-bold mb-3">{q.prompt}</div>
        <div className="mb-4">
          <button onClick={()=> speak(dir==="en-th" ? q.item.en : q.item.th, dir==="en-th"?"en-US":"th-TH")} className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 px-3 py-1 text-sm"><Volume2 className="size-4"/> Listen</button>
        </div>
        {q.type === "mc" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {q.options.map((opt, i)=>(
              <button key={i} onClick={()=>submitMC(opt)} className="rounded-xl bg-white/10 hover:bg-white/20 px-4 py-3 text-left">{opt}</button>
            ))}
          </div>
        ) : (
          <form onSubmit={submitType} className="flex gap-2">
            <input
              name="ans" autoFocus
              className="flex-1 rounded p-2 bg-white text-black placeholder-slate-500"
              placeholder="Type your answer"
            />
            <button type="submit" className="rounded bg-emerald-500 px-4 py-2 hover:bg-emerald-600">Submit</button>
          </form>
        )}
      </Card>
    );
  }

  // done
  const lastHist = last(store.quizHistory);
  return (
    <Card>
      <div className="text-lg font-bold mb-2">Summary</div>
      {lastHist ? (
        <div className="mb-2 text-sm text-slate-300">{new Date(lastHist.date).toLocaleString()} · {lastHist.mode} · {lastHist.dir}</div>
      ) : null}
      <div className="text-2xl font-bold mb-3">Score: {score}/{questions.length}</div>
      <div className="flex gap-2">
        <button onClick={()=>{ setDone(false); setStarted(false); }} className="rounded bg-white/10 px-4 py-2 hover:bg-white/20">Change options</button>
        <button onClick={start} className="rounded bg-emerald-500 px-4 py-2 hover:bg-emerald-600">Restart</button>
      </div>
    </Card>
  );
}

/* =============================================
   Listening Lab (TTS + Mic + optional STT)
============================================= */
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

  function normalize(s) {
    return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
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
    } catch (e) {
      alert("Microphone not available.");
    }
  }
  function stopRecording() {
    try { recorderRef.current && recorderRef.current.stop(); } catch {}
    setRecording(false);
  }

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
                {store.deck.map((d)=>(
                  <option key={d.id} value={d.id}>{d.en} — {d.th}</option>
                ))}
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
            <button onClick={()=> speak(expected || "", "en-US")} className="inline-flex items-center gap-2 rounded bg-white/10 px-3 py-2 hover:bg-white/20">
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

/* =============================================
   Content Manager (CSV import)
============================================= */
function ContentManager({ store, setStore }) {
  const fileRef = useRef(null);
  const [error, setError] = useState("");

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const rows = parseCSV(text);
        if (!rows.length) { setError('CSV must include headers: en, th (optional: pos, example)'); return; }
        const lastDeck = last(store.deck);
        const nextIdStart = (lastDeck?.id || 0) + 1;
        const newCards = rows.map((r, i) => ({ id: nextIdStart + i, ...r }));
        const nextDeck = [...store.deck, ...newCards];
        const nextProgress = {};
        newCards.forEach((c) => { nextProgress[c.id] = { ef: 2.5, interval: 0, due: todayKey(), correct: 0, wrong: 0, reps: 0, introduced: false, introducedOn: null }; });
        setStore((s) => ({ ...s, deck: nextDeck, cards: { ...s.cards, ...nextProgress } }));
        setError("");
      } catch {
        setError('Failed to read file.');
      }
    };
    reader.readAsText(f);
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">Import words from CSV</div>
          <div className="text-sm text-slate-400">Headers: en, th, pos, example</div>
        </div>
        <button className="rounded-xl bg-white/10 hover:bg-white/20 px-4 py-2" onClick={() => fileRef.current?.click()}>Choose file</button>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFile} />
      </div>
      {error && <div className="text-rose-300 text-sm mt-2">{error}</div>}
      <div className="mt-4 text-sm text-slate-300">Total words: {store.deck.length}</div>
    </Card>
  );
}

/* =============================================
   Manage Words (manual CRUD)
============================================= */
function ManageWords({ store, setStore }) {
  const [en, setEn] = useState("");
  const [th, setTh] = useState("");
  const [example, setExample] = useState("");
  const [pos, setPos] = useState("noun");
  const [editingId, setEditingId] = useState(null);

  function clearForm() {
    setEn(""); setTh(""); setExample(""); setPos("noun"); setEditingId(null);
  }

  function addWord() {
    if (!en.trim() || !th.trim()) return alert("Please enter EN and TH.");
    const lastDeck = last(store.deck);
    const nextId = (lastDeck?.id || 0) + 1;
    const newCard = { id: nextId, en, th, pos, example };
    const newDeck = [...store.deck, newCard];
    setStore((s) => ({
      ...s,
      deck: newDeck,
      cards: { ...s.cards, [nextId]: { ef: 2.5, interval: 0, due: todayKey(), correct: 0, wrong: 0, reps: 0, introduced: false, introducedOn: null } }
    }));
    clearForm();
  }

  function startEdit(card) {
    setEditingId(card.id);
    setEn(card.en); setTh(card.th); setExample(card.example || ""); setPos(card.pos || "noun");
  }

  function updateWord() {
    if (!editingId) return;
    const newDeck = store.deck.map((c) => c.id === editingId ? { ...c, en, th, example, pos } : c);
    setStore((s) => ({ ...s, deck: newDeck }));
    clearForm();
  }

  function deleteWord(id) {
    if (!confirm("Delete this word?")) return;
    const newDeck = store.deck.filter((c) => c.id !== id);
    const newCards = { ...store.cards };
    delete newCards[id];
    setStore((s) => ({ ...s, deck: newDeck, cards: newCards }));
    if (editingId === id) clearForm();
  }

  return (
    <Card>
      <div className="text-lg font-bold mb-4">Manage words</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
        <input className="w-full p-2 bg-white text-black rounded placeholder-slate-500" placeholder="EN (word)" value={en} onChange={(e) => setEn(e.target.value)} />
        <input className="w-full p-2 bg-white text-black rounded placeholder-slate-500" placeholder="TH (meaning)" value={th} onChange={(e) => setTh(e.target.value)} />
        <input className="w-full p-2 bg-white text-black rounded placeholder-slate-500" placeholder="Example sentence (optional)" value={example} onChange={(e) => setExample(e.target.value)} />
        <select className="w-full p-2 bg-white text-black rounded" value={pos} onChange={(e) => setPos(e.target.value)}>
          <option value="noun">noun</option>
          <option value="verb">verb</option>
          <option value="adjective">adjective</option>
          <option value="adverb">adverb</option>
          <option value="noun/verb">noun/verb</option>
        </select>
      </div>
      <div className="flex gap-2 mb-6">
        {editingId ? (
          <>
            <button onClick={updateWord} className="px-4 py-2 bg-blue-500 rounded hover:bg-blue-600">Update</button>
            <button onClick={clearForm} className="px-4 py-2 bg-gray-500 rounded hover:bg-gray-600">Cancel</button>
          </>
        ) : (
          <button onClick={addWord} className="px-4 py-2 bg-green-500 rounded hover:bg-green-600">Add</button>
        )}
      </div>

      <div className="max-h-80 overflow-auto pr-1">
        <ul className="space-y-2">
          {store.deck.map((item) => (
            <li key={item.id} className="flex justify-between items-center gap-3 bg-white/5 px-3 py-2 rounded-xl">
              <span className="text-sm">
                <b>{item.en}</b> — {item.th} <i className="text-slate-300">({item.pos})</i>
                {item.example ? <span className="text-slate-300"> · “{item.example}”</span> : null}
              </span>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => startEdit(item)} className="px-2 py-1 bg-yellow-500 rounded hover:bg-yellow-600 text-sm">Edit</button>
                <button onClick={() => deleteWord(item.id)} className="px-2 py-1 bg-red-500 rounded hover:bg-red-600 text-sm">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

/* =============================================
   Settings
============================================= */
function Settings({ store, setStore }) {
  const [goal, setGoal] = useState(store.goal);
  const [easyInt, setEasyInt] = useState(store.intervals?.easy ?? 3);
  const [goodInt, setGoodInt] = useState(store.intervals?.good ?? 2);
  const [hardInt, setHardInt] = useState(store.intervals?.hard ?? 1);
  const [dailyNew, setDailyNew] = useState(store.dailyNew ?? 10);

  function saveSettings() {
    setStore((s) => ({ ...s, goal: Number(goal), intervals: { easy: Number(easyInt), good: Number(goodInt), hard: Number(hardInt) }, dailyNew: Number(dailyNew) }));
  }

  function rescheduleAll() {
    const cards = { ...store.cards };
    Object.keys(cards).forEach((id) => {
      const c = cards[id];
      if (!c.introduced) return;
      const next = scheduleNext(c, 4, { easy: Number(easyInt), good: Number(goodInt), hard: Number(hardInt) });
      cards[id] = { ...c, due: next.due, interval: next.interval, ef: next.ef, reps: Math.max(c.reps, next.reps) };
    });
    setStore((s) => ({ ...s, cards }));
  }

  return (
    <Card>
      <div className="text-lg font-bold mb-4">Settings: SRS & Goals</div>

      <label className="block text-sm mb-1">Daily XP goal</label>
      <input
        type="number" min={10} step={5} value={goal}
        onChange={(e) => setGoal(e.target.value)}
        className="mb-4 w-full rounded p-2 bg-white text-black placeholder-slate-500"
      />

      <div className="mb-4">
        <div className="text-sm mb-1">Base review intervals (days)</div>
        <div className="flex flex-wrap gap-3 mb-2">
          <label className="flex items-center gap-2">Easy:
            <input type="number" min={1} value={easyInt} onChange={(e) => setEasyInt(e.target.value)} className="w-20 rounded p-1 bg-white text-black" />
          </label>
          <label className="flex items-center gap-2">Good:
            <input type="number" min={1} value={goodInt} onChange={(e) => setGoodInt(e.target.value)} className="w-20 rounded p-1 bg-white text-black" />
          </label>
          <label className="flex items-center gap-2">Hard:
            <input type="number" min={1} value={hardInt} onChange={(e) => setHardInt(e.target.value)} className="w-20 rounded p-1 bg-white text-black" />
          </label>
        </div>
        <div className="text-xs text-slate-300">Tip: Hard≈1, Good≈2, Easy≈3 for first rounds; EF expands spacing later.</div>
      </div>

      <div className="mb-4">
        <div className="text-sm mb-1">Daily new words</div>
        <input
          type="number" min={0} value={dailyNew}
          onChange={(e) => setDailyNew(e.target.value)}
          className="w-32 rounded p-2 bg-white text-black"
        />
        <div className="text-xs text-slate-300 mt-1">Each day up to this many unintroduced words will enter the review queue.</div>
      </div>

      <div className="flex gap-2 mt-2">
        <button onClick={saveSettings} className="rounded bg-emerald-500 px-4 py-2 hover:bg-emerald-600">Save</button>
        <button onClick={rescheduleAll} className="rounded bg-white/10 border border-white/20 px-4 py-2 hover:bg-white/20">Recompute schedules</button>
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

/* ==========================================================
   Lightweight Dev Tests (run once, logs to console)
========================================================== */
function runDevTests() {
  try {
    const csv1 = "en,th,pos,example\nhello,สวัสดี,noun,hello there";
    const rows1 = parseCSV(csv1);
    console.assert(Array.isArray(rows1) && rows1.length === 1, "parseCSV basic length");
    console.assert(rows1[0].en === "hello" && rows1[0].th === "สวัสดี", "parseCSV fields");

    const csv2 = 'en,th\n"a, b",เอ บี';
    const rows2 = parseCSV(csv2);
    console.assert(rows2.length === 1 && rows2[0].en === "a, b", "parseCSV quoted comma");

    const base = { ef: 2.5, interval: 0, reps: 0, due: todayKey(), correct: 0, wrong: 0, introduced: true, introducedOn: todayKey() };
    const i1 = scheduleNext(base, 4, { easy: 3, good: 2, hard: 1 });
    console.assert(i1.interval >= 2 && i1.reps === 1, "sched first success");

    const i2 = scheduleNext({ ...base, ...i1 }, 4, { easy: 3, good: 2, hard: 1 });
    console.assert(i2.interval >= 3 && i2.reps === 2, "sched second success");

    const i3 = scheduleNext({ ...base, ...i2 }, 5, { easy: 3, good: 2, hard: 1 });
    console.assert(i3.interval > i2.interval, "sched grows later");

    const fail = scheduleNext(base, 2, { easy: 3, good: 2, hard: 1 });
    console.assert(fail.reps === 0 && fail.interval >= 1, "sched fail resets reps to 0");

    console.log("[EN Trainer] Dev tests passed");
  } catch (e) {
    console.error("[EN Trainer] Dev tests failed", e);
  }
}

if (typeof window !== "undefined" && !window.__EN_TRAINER_TESTED__) {
  window.__EN_TRAINER_TESTED__ = true;
  runDevTests();
}
