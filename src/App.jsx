import React, { useEffect, useMemo, useRef, useState, Suspense } from "react";
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
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

// Lazy tabs
const Quiz = React.lazy(() => import("./tabs/Quiz.jsx"));
const ListeningLab = React.lazy(() => import("./tabs/ListeningLab.jsx"));
const Settings = React.lazy(() => import("./tabs/Settings.jsx"));

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
    const qMul = quality >= 5 ? 1.25 : 1.0;
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
              <Suspense fallback={<Card><div className="py-6 text-center">Loading quiz…</div></Card>}>
                <Quiz store={store} setStore={setStore} onXP={addXP} />
              </Suspense>
            </motion.div>
          )}
          {tab === "listen" && (
            <motion.div key="listen" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <Suspense fallback={<Card><div className="py-6 text-center">Loading listening lab…</div></Card>}>
                <ListeningLab store={store} onXP={addXP} />
              </Suspense>
            </motion.div>
          )}
          {tab === "settings" && (
            <motion.div key="settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <Suspense fallback={<Card><div className="py-6 text-center">Loading settings…</div></Card>}>
                <Settings
                  store={store}
                  setStore={setStore}
                  todayKey={todayKey}
                  scheduleNext={scheduleNext}
                  parseCSV={parseCSV}
                />
              </Suspense>
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
    <header
      className="sticky top-0 z-40 backdrop-blur bg-black/30 border-b border-white/10"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }} // keep below iOS notch
    >
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
          {/* hide on mobile; theme toggle is available in Settings */}
          <button
            className="hidden md:inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 px-3 py-1 text-sm"
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
  // Only cards that are introduced and due
  const dueCards = useMemo(
    () =>
      store.deck.filter((c) => {
        const prog = store.cards[c.id] ?? {};
        return !!prog.introduced && (prog.due ?? todayKey()) <= todayKey();
      }),
    [store.deck, store.cards]
  );

  const [idx, setIdx] = useState(0);
  const [show, setShow] = useState(false);

  // When the number of due cards changes, keep index valid
  useEffect(() => {
    if (idx >= dueCards.length && dueCards.length > 0) setIdx(0);
  }, [dueCards.length, idx]);

  // Reset “show translation” when card changes
  useEffect(() => { setShow(false); }, [idx]);

  // If nothing due, show the "all caught up" card
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

  // Safe to read current card now
  const card = dueCards[idx];

  function grade(quality) {
    // Defensive read in case something changes between click & render
    if (!card) return;

    const prog = store.cards[card.id] ?? {
      ef: 2.5, interval: 0, reps: 0, correct: 0, wrong: 0, introduced: true, introducedOn: todayKey(), due: todayKey()
    };

    const next = scheduleNext(prog, quality, store.intervals);
    const updated = {
      ...prog,
      ...next,
      correct: prog.correct + (quality >= 3 ? 1 : 0),
      wrong: prog.wrong + (quality < 3 ? 1 : 0),
    };

    setStore((s) => ({ ...s, cards: { ...s.cards, [card.id]: updated } }));
    onXP(quality >= 3 ? 10 : 4);

    // Decide next index based on the OLD list length; a clamp effect above will
    // keep it valid after the list shrinks.
    setIdx((i) => (i < dueCards.length - 1 ? i + 1 : 0));
  }

  const remainingAfterThis = Math.max(0, dueCards.length - 1);

  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 min-h-[60dvh] sm:min-h-[320px] flex flex-col">
          <div className="text-sm text-slate-300 flex items-center justify-between">
            <span>Card {idx + 1}/{dueCards.length}</span>
            <span className="text-slate-400">Remaining today: <b>{remainingAfterThis}</b></span>
          </div>

          <div className="mt-2 text-4xl font-extrabold tracking-tight">{card.en}</div>
          <div className="text-sm text-slate-400">{card.pos}</div>

          {!show && (
            <div className="mt-6">
              <button
                onClick={() => speak(card.en, "en-US")}
                className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 px-3 py-1 text-sm"
              >
                <Volume2 className="size-4" /> Listen (EN)
              </button>
            </div>
          )}

          <AnimatePresence>
            {show && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-6"
              >
                <div className="text-xl">{card.th}</div>
                <div className="text-sm text-slate-300 mt-2">Example: <i>{card.example}</i></div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-auto pt-6 flex flex-wrap gap-2">
            <button
              onClick={() => setShow(true)}
              className="rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 px-4 py-2"
            >
              Show translation
            </button>

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
