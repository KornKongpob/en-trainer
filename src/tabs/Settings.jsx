// src/tabs/Settings.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarCheck2, Sparkles } from "lucide-react";

/* Local helpers (duplicated small utils for this file) */
const classNames = (...a) => a.filter(Boolean).join(" ");
const toKeyDate = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const todayKey = () => toKeyDate();
const nowMs = () => Date.now();

function Card({ children }) { return (<div className="rounded-3xl border border-white/10 bg-white/5 p-4">{children}</div>); }

/* CSV parser */
function parseCSV(text) {
  const t = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let i = 0, field = "", row = [], inQuotes = false;
  while (i < t.length) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
    i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];

  const header = rows[0].map(h => h.trim().toLowerCase());
  const findIdx = (names) => names.map(n => header.indexOf(n)).find(x => x !== -1);

  const idx = {
    en: findIdx(["en"]),
    th: findIdx(["th"]),
    pos: findIdx(["pos","part of speech","part_of_speech"]),
    example: findIdx(["example","examples","ex","sample"]),
    syn: findIdx(["sym","syn","syn.","synonym","synonyms"]),
  };
  if (idx.en === -1 || idx.th === -1) return [];

  const expectedLen = header.length;
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    let cols = rows[r];
    if (cols.length > expectedLen) {
      const head = cols.slice(0, expectedLen - 1);
      const tail = cols.slice(expectedLen - 1).join(",");
      cols = [...head, tail];
    }
    const en = (cols[idx.en] ?? "").trim();
    const th = (cols[idx.th] ?? "").trim();
    if (!en || !th) continue;
    const pos = (idx.pos != null && idx.pos !== -1 ? cols[idx.pos] : "noun")?.trim() || "noun";
    const example = (idx.example != null && idx.example !== -1 ? cols[idx.example] : "")?.trim() || "";
    const syn = (idx.syn != null && idx.syn !== -1 ? cols[idx.syn] : "")?.trim() || "";
    out.push({ en, th, pos, example, syn });
  }
  return out;
}

/* ===========================
   Settings root
=========================== */
export default function Settings({ store, setStore }) {
  const [tab, setTab] = useState("general"); // general | day1 | day2 | audio | import | manage | timing
  return (
    <Card>
      <div className="text-lg font-bold mb-4">Settings</div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={()=>setTab("general")} className={classNames("px-3 py-2 rounded", tab==="general"?"bg-emerald-500/30":"bg-white/10 hover:bg-white/20")}>General</button>
        <button onClick={()=>setTab("day1")} className={classNames("px-3 py-2 rounded", tab==="day1"?"bg-emerald-500/30":"bg-white/10 hover:bg-white/20")}>Day-1 timings</button>
        <button onClick={()=>setTab("day2")} className={classNames("px-3 py-2 rounded", tab==="day2"?"bg-emerald-500/30":"bg-white/10 hover:bg-white/20")}>Day-2 timings</button>
        <button onClick={()=>setTab("timing")} className={classNames("px-3 py-2 rounded", tab==="timing"?"bg-emerald-500/30":"bg-white/10 hover:bg-white/20")}>Timing (Day-3+)</button>
        <button onClick={()=>setTab("audio")} className={classNames("px-3 py-2 rounded", tab==="audio"?"bg-emerald-500/30":"bg-white/10 hover:bg-white/20")}>Audio / TTS</button>
        <button onClick={()=>setTab("import")} className={classNames("px-3 py-2 rounded", tab==="import"?"bg-emerald-500/30":"bg-white/10 hover:bg-white/20")}>Import CSV</button>
        <button onClick={()=>setTab("manage")} className={classNames("px-3 py-2 rounded", tab==="manage"?"bg-emerald-500/30":"bg-white/10 hover:bg-white/20")}>Manage Words</button>
      </div>

      {tab === "general" && <GeneralSettings store={store} setStore={setStore} />}
      {tab === "day1" && <Day1Settings store={store} setStore={setStore} />}
      {tab === "day2" && <Day2Settings store={store} setStore={setStore} />}
      {tab === "timing" && <TimingSettings store={store} setStore={setStore} />}
      {tab === "audio" && <AudioSettings store={store} setStore={setStore} />}
      {tab === "import" && <ContentManager store={store} setStore={setStore} />}
      {tab === "manage" && <ManageWords store={store} setStore={setStore} />}
    </Card>
  );
}

function GeneralSettings({ store, setStore }) {
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
      // Recompute with "good" as baseline
      const interval = Math.max(1, Number(goodInt || 2));
      const dueAt = nowMs() + interval * 86_400_000;
      cards[id] = { ...c, due: toKeyDate(new Date(dueAt)), dueAt, interval, reps: Math.max(c.reps || 0, 1) };
    });
    setStore((s) => ({ ...s, cards }));
  }

  return (
    <>
      <label className="block text-sm mb-1">Daily XP goal</label>
      <input
        type="number" min={10} step={5} value={goal}
        onChange={(e) => setGoal(e.target.value)}
        className="mb-4 w-full rounded p-2 bg-white text-black placeholder-slate-500"
      />

      <div className="mb-4">
        <div className="text-sm mb-1">Base review intervals (days) for Day-3+</div>
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
        <div className="text-xs text-slate-300">These are the SM-2 base intervals for Day-3+. EF and timing factor adapt spacing over time.</div>
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
    </>
  );
}

function Day1Settings({ store, setStore }) {
  const [againMins, setAgainMins] = useState(store.day1?.againMins ?? 5);
  const [hardMins, setHardMins] = useState(store.day1?.hardMins ?? 10);
  const [goodDays, setGoodDays] = useState(store.day1?.goodDays ?? 1);
  const [easyDays, setEasyDays] = useState(store.day1?.easyDays ?? 2);

  function save() {
    setStore((s) => ({ ...s, day1: {
      againMins: Number(againMins),
      hardMins: Number(hardMins),
      goodDays: Number(goodDays),
      easyDays: Number(easyDays),
    }}));
  }

  return (
    <>
      <div className="text-sm mb-2">Day-1 timings (when you first learn a word)</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex items-center gap-2">Again (minutes)
          <input type="number" min={1} className="w-24 rounded p-2 bg-white text-black" value={againMins} onChange={(e)=>setAgainMins(e.target.value)} />
        </label>
        <label className="flex items-center gap-2">Hard (minutes)
          <input type="number" min={1} className="w-24 rounded p-2 bg-white text-black" value={hardMins} onChange={(e)=>setHardMins(e.target.value)} />
        </label>
        <label className="flex items-center gap-2">Good (days)
          <input type="number" min={1} className="w-24 rounded p-2 bg-white text-black" value={goodDays} onChange={(e)=>setGoodDays(e.target.value)} />
        </label>
        <label className="flex items-center gap-2">Easy (days)
          <input type="number" min={1} className="w-24 rounded p-2 bg-white text-black" value={easyDays} onChange={(e)=>setEasyDays(e.target.value)} />
        </label>
      </div>
      <div className="text-xs text-slate-300 mt-2">After Day-1, Day-2 uses (5m / 15m / 1d / 2d). Day-3+ is performance-based (SM-2 + timing).</div>
      <div className="mt-3">
        <button onClick={save} className="rounded bg-emerald-500 px-4 py-2 hover:bg-emerald-600">Save Day-1 timings</button>
      </div>
    </>
  );
}

function Day2Settings({ store, setStore }) {
  const [againMins, setAgainMins] = useState(store.secondReview?.againMins ?? 5);
  const [hardMins, setHardMins] = useState(store.secondReview?.hardMins ?? 15);
  const [goodDays, setGoodDays] = useState(store.secondReview?.goodDays ?? 1);
  const [easyDays, setEasyDays] = useState(store.secondReview?.easyDays ?? 2);

  function save() {
    setStore((s) => ({ ...s, secondReview: {
      againMins: Number(againMins),
      hardMins: Number(hardMins),
      goodDays: Number(goodDays),
      easyDays: Number(easyDays),
    }}));
  }

  return (
    <>
      <div className="text-sm mb-2">Day-2 timings (your requested change: Hard = <b>15m</b>)</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex items-center gap-2">Again (minutes)
          <input type="number" min={1} className="w-24 rounded p-2 bg-white text-black" value={againMins} onChange={(e)=>setAgainMins(e.target.value)} />
        </label>
        <label className="flex items-center gap-2">Hard (minutes)
          <input type="number" min={1} className="w-24 rounded p-2 bg-white text-black" value={hardMins} onChange={(e)=>setHardMins(e.target.value)} />
        </label>
        <label className="flex items-center gap-2">Good (days)
          <input type="number" min={1} className="w-24 rounded p-2 bg-white text-black" value={goodDays} onChange={(e)=>setGoodDays(e.target.value)} />
        </label>
        <label className="flex items-center gap-2">Easy (days)
          <input type="number" min={1} className="w-24 rounded p-2 bg-white text-black" value={easyDays} onChange={(e)=>setEasyDays(e.target.value)} />
        </label>
      </div>
      <div className="text-xs text-slate-300 mt-2">If you press <b>Again</b> on Day-3+, the card will temporarily follow Day-2 rules again for the rest of today.</div>
      <div className="mt-3">
        <button onClick={save} className="rounded bg-emerald-500 px-4 py-2 hover:bg-emerald-600">Save Day-2 timings</button>
      </div>
    </>
  );
}

function TimingSettings({ store, setStore }) {
  const [fastMs, setFastMs] = useState(store.timing?.fastMs ?? 5000);
  const [slowMs, setSlowMs] = useState(store.timing?.slowMs ?? 25000);
  const [clampMin, setClampMin] = useState(store.timing?.clampMin ?? 0.75);
  const [clampMax, setClampMax] = useState(store.timing?.clampMax ?? 1.25);

  function save() {
    setStore((s) => ({ ...s, timing: {
      fastMs: Number(fastMs),
      slowMs: Number(slowMs),
      clampMin: Number(clampMin),
      clampMax: Number(clampMax),
    }}));
  }

  return (
    <>
      <div className="text-sm mb-2">Hidden timing tuner for Day-3+ (affects spacing via your answer speed)</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="flex items-center gap-2">Fast (ms)
          <input type="number" min={1000} step={100} className="w-28 rounded p-2 bg-white text-black" value={fastMs} onChange={(e)=>setFastMs(e.target.value)} />
        </label>
        <label className="flex items-center gap-2">Slow (ms)
          <input type="number" min={2000} step={100} className="w-28 rounded p-2 bg-white text-black" value={slowMs} onChange={(e)=>setSlowMs(e.target.value)} />
        </label>
        <label className="flex items-center gap-2">Clamp min
          <input type="number" step={0.01} min={0.25} max={1.5} className="w-28 rounded p-2 bg-white text-black" value={clampMin} onChange={(e)=>setClampMin(e.target.value)} />
        </label>
        <label className="flex items-center gap-2">Clamp max
          <input type="number" step={0.01} min={0.25} max={2} className="w-28 rounded p-2 bg-white text-black" value={clampMax} onChange={(e)=>setClampMax(e.target.value)} />
        </label>
      </div>
      <div className="text-xs text-slate-300 mt-2">
        ≤ Fast → larger intervals (up to max); ≥ Slow → smaller intervals (down to min). Interpolated in-between.
      </div>
      <div className="mt-3">
        <button onClick={save} className="rounded bg-emerald-500 px-4 py-2 hover:bg-emerald-600">Save timing</button>
      </div>
    </>
  );
}

/* ===========================
   Audio Settings
=========================== */
function AudioSettings({ store, setStore }) {
  const [voices, setVoices] = useState([]);
  const [enVoice, setEnVoice] = useState(store.tts?.enVoice ?? "");
  const [thVoice, setThVoice] = useState(store.tts?.thVoice ?? "");
  const [rate, setRate] = useState(store.tts?.rate ?? 0.92);
  const [pitch, setPitch] = useState(store.tts?.pitch ?? 1.0);
  const [volume, setVolume] = useState(store.tts?.volume ?? 1.0);

  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const populate = () => setVoices(synth.getVoices?.() || []);
    populate();
    try {
      synth.addEventListener("voiceschanged", populate);
      return () => synth.removeEventListener("voiceschanged", populate);
    } catch {}
  }, []);

  const enList = voices.filter(v => (v.lang || "").toLowerCase().startsWith("en"));
  const thList = voices.filter(v => (v.lang || "").toLowerCase().startsWith("th"));

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
      const prefName = lang.startsWith("th") ? tts?.thVoice : tts?.enVoice;
      const best = pickBestVoice(voices, lang, prefName);
      if (best) u.voice = best;
      u.rate = Number(tts?.rate ?? 0.92);
      u.pitch = Number(tts?.pitch ?? 1.0);
      u.volume = Number(tts?.volume ?? 1.0);
      synth.cancel(); synth.speak(u);
    } catch {}
  }

  function save() {
    setStore((s) => ({ ...s, tts: { ...s.tts, enVoice, thVoice, rate: Number(rate), pitch: Number(pitch), volume: Number(volume) } }));
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex items-center gap-2">EN voice
          <select value={enVoice} onChange={(e)=>setEnVoice(e.target.value)} className="flex-1 rounded p-2 bg-white text-black">
            <option value="">Auto-pick best</option>
            {enList.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">TH voice
          <select value={thVoice} onChange={(e)=>setThVoice(e.target.value)} className="flex-1 rounded p-2 bg-white text-black">
            <option value="">Auto-pick best</option>
            {thList.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
        <label className="flex items-center gap-2">Rate
          <input type="number" step="0.01" min="0.5" max="1.5" value={rate} onChange={(e)=>setRate(e.target.value)} className="w-24 rounded p-2 bg-white text-black" />
        </label>
        <label className="flex items-center gap-2">Pitch
          <input type="number" step="0.01" min="0.5" max="1.5" value={pitch} onChange={(e)=>setPitch(e.target.value)} className="w-24 rounded p-2 bg-white text-black" />
        </label>
        <label className="flex items-center gap-2">Volume
          <input type="number" step="0.1" min="0" max="1" value={volume} onChange={(e)=>setVolume(e.target.value)} className="w-24 rounded p-2 bg-white text-black" />
        </label>
      </div>

      <div className="flex gap-2 mt-3">
        <button onClick={() => ttsSpeak("This is the English preview.", "en-US", { enVoice, rate, pitch, volume })} className="rounded bg-white/10 px-3 py-2 hover:bg-white/20">Preview EN</button>
        <button onClick={() => ttsSpeak("นี่คือเสียงตัวอย่างภาษาไทย", "th-TH", { thVoice, rate, pitch, volume })} className="rounded bg-white/10 px-3 py-2 hover:bg-white/20">Preview TH</button>
        <button onClick={save} className="rounded bg-emerald-500 px-4 py-2 hover:bg-emerald-600 ml-auto">Save audio settings</button>
      </div>
      <div className="text-xs text-slate-400 mt-2">Tip: Chrome often has “Google” voices; Edge has “Microsoft … Online (Natural)”.</div>
    </>
  );
}

/* ===========================
   CSV Import (with duplicate decision)
=========================== */
function ContentManager({ store, setStore }) {
  const fileRef = useRef(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  function onFile(e) {
    setError(""); setInfo("");
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const rows = parseCSV(text);
        if (!rows.length) { setError("CSV must include headers: en, th, pos, example, sym"); return; }

        const existingMap = new Map(store.deck.map(d => [d.en.toLowerCase(), d]));
        const duplicates = [];
        const newOnes = [];

        for (const r of rows) {
          const key = r.en.toLowerCase();
          if (existingMap.has(key)) duplicates.push(r);
          else newOnes.push(r);
        }

        let replaceDup = false;
        if (duplicates.length) {
          replaceDup = window.confirm(
            `${duplicates.length} word(s) already exist. Click OK to REPLACE them with CSV data, or Cancel to SKIP duplicates.`
          );
        }

        const nextDeck = [...store.deck];
        const nextCards = { ...store.cards };

        if (replaceDup) {
          for (const r of duplicates) {
            const idx = nextDeck.findIndex(d => d.en.toLowerCase() === r.en.toLowerCase());
            if (idx !== -1) {
              nextDeck[idx] = { ...nextDeck[idx], th: r.th, pos: r.pos, example: r.example, syn: r.syn || "" };
            }
          }
        }

        let nextId = (last(nextDeck)?.id || 0) + 1;
        for (const r of newOnes) {
          const newCard = { id: nextId++, en: r.en, th: r.th, pos: r.pos, example: r.example, syn: r.syn || "" };
          nextDeck.push(newCard);
          nextCards[newCard.id] = {
            ef: 2.5, interval: 0, due: todayKey(), dueAt: nowMs(),
            correct: 0, wrong: 0, reps: 0, reviews: 0,
            introduced: false, introducedOn: null,
            stageOverride: null, stageOverrideUntil: null,
            lastLatencyMs: null, avgLatencyMs: null, latencyCount: 0, latencyHistory: [],
          };
        }

        setStore((s) => ({ ...s, deck: nextDeck, cards: nextCards }));
        setInfo(`Imported: ${newOnes.length} new, ${duplicates.length ? (replaceDup ? "replaced" : "skipped") : "0 duplicates"}.`);
        e.target.value = "";
      } catch {
        setError("Failed to read file.");
      }
    };
    reader.readAsText(f);
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">Import words from CSV</div>
          <div className="text-sm text-slate-400">Headers: <b>en, th, pos, example, sym</b></div>
        </div>
        <button className="rounded-xl bg-white/10 hover:bg-white/20 px-4 py-2" onClick={() => fileRef.current?.click()}>Choose file</button>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFile} />
      </div>
      {error && <div className="text-rose-300 text-sm mt-2">{error}</div>}
      {info && <div className="text-emerald-300 text-sm mt-2">{info}</div>}
      <div className="mt-4 text-sm text-slate-300">Total words: {store.deck.length}</div>
    </>
  );
}

/* ===========================
   Manage Words (bulk select + delete)
=========================== */
function ManageWords({ store, setStore }) {
  const [en, setEn] = useState("");
  const [th, setTh] = useState("");
  const [example, setExample] = useState("");
  const [pos, setPos] = useState("noun");
  const [syn, setSyn] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set());

  function clearForm() { setEn(""); setTh(""); setExample(""); setPos("noun"); setSyn(""); setEditingId(null); }

  function addWord() {
    if (!en.trim() || !th.trim()) return alert("Please enter EN and TH.");
    const nextId = (store.deck[store.deck.length - 1]?.id || 0) + 1;
    const newCard = { id: nextId, en, th, pos, example, syn };
    const newDeck = [...store.deck, newCard];
    setStore((s) => ({
      ...s,
      deck: newDeck,
      cards: { ...s.cards, [nextId]: {
        ef: 2.5, interval: 0, due: todayKey(), dueAt: nowMs(),
        correct: 0, wrong: 0, reps: 0, reviews: 0,
        introduced: false, introducedOn: null,
        stageOverride: null, stageOverrideUntil: null,
        lastLatencyMs: null, avgLatencyMs: null, latencyCount: 0, latencyHistory: [],
      } }
    }));
    clearForm();
  }

  function startEdit(card) {
    setEditingId(card.id);
    setEn(card.en); setTh(card.th); setExample(card.example || ""); setPos(card.pos || "noun"); setSyn(card.syn || "");
  }

  function updateWord() {
    if (!editingId) return;
    const newDeck = store.deck.map((c) => c.id === editingId ? { ...c, en, th, example, pos, syn } : c);
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
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }

  function deleteSelected() {
    if (!selected.size) return;
    const ids = Array.from(selected);
    const preview = ids.slice(0, 5).map(id => store.deck.find(d => d.id === id)?.en || id).join(", ");
    if (!confirm(`Delete ${ids.length} selected word(s)?\n${preview}${ids.length > 5 ? ", ..." : ""}`)) return;
    const idSet = new Set(ids);
    const newDeck = store.deck.filter(c => !idSet.has(c.id));
    const newCards = { ...store.cards };
    ids.forEach(id => delete newCards[id]);
    setStore((s) => ({ ...s, deck: newDeck, cards: newCards }));
    if (editingId && idSet.has(editingId)) clearForm();
    setSelected(new Set());
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return store.deck;
    return store.deck.filter(d =>
      d.en.toLowerCase().includes(q) ||
      d.th.toLowerCase().includes(q) ||
      (d.syn || "").toLowerCase().includes(q)
    );
  }, [store.deck, query]);

  const allVisibleSelected = filtered.length && filtered.every(item => selected.has(item.id));
  function toggleSelect(id, checked) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }
  function toggleSelectAllVisible(checked) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) filtered.forEach(item => next.add(item.id));
      else filtered.forEach(item => next.delete(item.id));
      return next;
    });
  }

  return (
    <>
      <div className="mb-3 flex flex-col sm:flex-row gap-2 sm:items-center">
        <input
          className="flex-1 p-2 bg-white text-black rounded placeholder-slate-500"
          placeholder="Search words / meanings / synonyms"
          value={query}
          onChange={(e)=>setQuery(e.target.value)}
        />
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={!!allVisibleSelected} onChange={(e)=>toggleSelectAllVisible(e.target.checked)} />
          Select all (visible)
        </label>
        {selected.size > 0 && (
          <button onClick={deleteSelected} className="px-3 py-2 bg-red-500 rounded hover:bg-red-600 text-sm">
            Delete selected ({selected.size})
          </button>
        )}
      </div>

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
        <input className="w-full p-2 bg-white text-black rounded placeholder-slate-500 md:col-span-2" placeholder="Synonyms (comma-separated) — e.g., fast,quick,rapid" value={syn} onChange={(e) => setSyn(e.target.value)} />
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
          {filtered.map((item) => {
            const checked = selected.has(item.id);
            return (
              <li key={item.id} className="flex justify-between items-center gap-3 bg-white/5 px-3 py-2 rounded-xl">
                <label className="flex items-center gap-2 shrink-0">
                  <input type="checkbox" checked={checked} onChange={(e)=>toggleSelect(item.id, e.target.checked)} />
                </label>
                <span className="text-sm flex-1">
                  <b>{item.en}</b> — {item.th} <i className="text-slate-300">({item.pos})</i>
                  {item.example ? <span className="text-slate-300"> · “{item.example}”</span> : null}
                  {item.syn ? (
                    <span className="block text-xs text-emerald-300 mt-1">
                      Syn: {item.syn.split(",").map(s=>s.trim()).filter(Boolean).join(", ")}
                    </span>
                  ) : null}
                </span>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => startEdit(item)} className="px-2 py-1 bg-yellow-500 rounded hover:bg-yellow-600 text-sm">Edit</button>
                  <button onClick={() => deleteWord(item.id)} className="px-2 py-1 bg-red-500 rounded hover:bg-red-600 text-sm">Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
