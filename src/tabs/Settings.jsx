// src/tabs/Settings.jsx
import React, { useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

/* ----------------- tiny helpers (local) ----------------- */
const todayKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

function parseCSV(text) {
  const t = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = [];
  let i = 0, field = "", row = [], inQuotes = false;
  while (i < t.length) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); lines.push(row); row = []; field = ""; }
      else field += c;
    }
    i++;
  }
  if (field.length || row.length) { row.push(field); lines.push(row); }
  if (!lines.length) return [];
  const header = lines[0].map((h) => h.trim().toLowerCase());
  const idx = {
    en: header.indexOf("en"),
    th: header.indexOf("th"),
    pos: header.indexOf("pos"),
    example: header.indexOf("example"),
  };
  if (idx.en === -1 || idx.th === -1) return [];
  return lines
    .slice(1)
    .map((cols) => ({
      en: (cols[idx.en] ?? "").trim(),
      th: (cols[idx.th] ?? "").trim(),
      pos: (idx.pos !== -1 ? cols[idx.pos] : "noun")?.trim() || "noun",
      example: (idx.example !== -1 ? cols[idx.example] : "")?.trim() || "",
    }))
    .filter((r) => r.en && r.th);
}

// SM-2 scheduling used by "Recompute schedules"
function scheduleNext(progress, quality, intervals) {
  let { ef = 2.5, interval = 0, reps = 0 } = progress;
  ef = Math.max(1.3, ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  if (quality < 3) {
    interval = Math.max(1, Number(intervals?.hard ?? 1));
    reps = 0;
  } else if (reps === 0) {
    interval = Math.max(1, Number(intervals?.good ?? 2));
    reps = 1;
  } else if (reps === 1) {
    interval = Math.max(interval, Number(intervals?.easy ?? 3));
    reps = 2;
  } else {
    const qMul = quality >= 5 ? 1.25 : 1.0;
    interval = Math.max(1, Math.round(interval * ef * qMul));
    reps += 1;
  }
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + interval);
  return { ef, interval, due: todayKey(nextDate), reps };
}

const Card = ({ children }) => (
  <div className="rounded-3xl border border-white/10 bg-white/5 p-4">{children}</div>
);

/* ----------------- main Settings tab ----------------- */
export default function Settings({ store, setStore }) {
  return (
    <div className="space-y-6">
      <SRSSection store={store} setStore={setStore} />
      <ManageWords store={store} setStore={setStore} />
      <CSVImport store={store} setStore={setStore} />
    </div>
  );
}

/* ----------------- SRS & Goals ----------------- */
function SRSSection({ store, setStore }) {
  const [goal, setGoal] = useState(store.goal);
  const [easyInt, setEasyInt] = useState(store.intervals?.easy ?? 3);
  const [goodInt, setGoodInt] = useState(store.intervals?.good ?? 2);
  const [hardInt, setHardInt] = useState(store.intervals?.hard ?? 1);
  const [dailyNew, setDailyNew] = useState(store.dailyNew ?? 10);

  function saveSettings() {
    setStore((s) => ({
      ...s,
      goal: Number(goal),
      intervals: { easy: Number(easyInt), good: Number(goodInt), hard: Number(hardInt) },
      dailyNew: Number(dailyNew),
    }));
  }

  function rescheduleAll() {
    const cards = { ...store.cards };
    Object.keys(cards).forEach((id) => {
      const c = cards[id];
      if (!c.introduced) return;
      const next = scheduleNext(c, 4, {
        easy: Number(easyInt),
        good: Number(goodInt),
        hard: Number(hardInt),
      });
      cards[id] = {
        ...c,
        due: next.due,
        interval: next.interval,
        ef: next.ef,
        reps: Math.max(c.reps || 0, next.reps || 0),
      };
    });
    setStore((s) => ({ ...s, cards }));
  }

  return (
    <Card>
      <div className="text-lg font-bold mb-4">SRS & Goals</div>

      <label className="block text-sm mb-1">Daily XP goal</label>
      <input
        type="number"
        min={10}
        step={5}
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        className="mb-4 w-full rounded p-2 bg-white text-black placeholder-slate-500"
      />

      <div className="mb-4">
        <div className="text-sm mb-1">Base review intervals (days)</div>
        <div className="flex flex-wrap gap-3 mb-2">
          <label className="flex items-center gap-2">
            Easy:
            <input
              type="number"
              min={1}
              value={easyInt}
              onChange={(e) => setEasyInt(e.target.value)}
              className="w-20 rounded p-1 bg-white text-black"
            />
          </label>
          <label className="flex items-center gap-2">
            Good:
            <input
              type="number"
              min={1}
              value={goodInt}
              onChange={(e) => setGoodInt(e.target.value)}
              className="w-20 rounded p-1 bg-white text-black"
            />
          </label>
          <label className="flex items-center gap-2">
            Hard:
            <input
              type="number"
              min={1}
              value={hardInt}
              onChange={(e) => setHardInt(e.target.value)}
              className="w-20 rounded p-1 bg-white text-black"
            />
          </label>
        </div>
        <div className="text-xs text-slate-300">
          Tip: Hard≈1, Good≈2, Easy≈3 for early reviews; EF grows the spacing later.
        </div>
      </div>

      <div className="mb-4">
        <div className="text-sm mb-1">Daily new words</div>
        <input
          type="number"
          min={0}
          value={dailyNew}
          onChange={(e) => setDailyNew(e.target.value)}
          className="w-32 rounded p-2 bg-white text-black"
        />
        <div className="text-xs text-slate-300 mt-1">
          Each day up to this many unintroduced words will enter the review queue.
        </div>
      </div>

      <div className="flex gap-2 mt-2">
        <button onClick={saveSettings} className="rounded bg-emerald-500 px-4 py-2 hover:bg-emerald-600">
          Save
        </button>
        <button
          onClick={rescheduleAll}
          className="rounded bg-white/10 border border-white/20 px-4 py-2 hover:bg-white/20"
        >
          Recompute schedules
        </button>
      </div>
    </Card>
  );
}

/* ----------------- Manage Words (with search) ----------------- */
function ManageWords({ store, setStore }) {
  const [en, setEn] = useState("");
  const [th, setTh] = useState("");
  const [example, setExample] = useState("");
  const [pos, setPos] = useState("noun");
  const [editingId, setEditingId] = useState(null);

  // Search/sort
  const [q, setQ] = useState("");
  const [field, setField] = useState("all"); // all | en | th
  const [sort, setSort] = useState("newest"); // newest | az | za

  function clearForm() {
    setEn(""); setTh(""); setExample(""); setPos("noun"); setEditingId(null);
  }

  function addWord() {
    if (!en.trim() || !th.trim()) return alert("Please enter EN and TH.");
    const lastDeck = store.deck[store.deck.length - 1];
    const nextId = (lastDeck?.id || 0) + 1;
    const newCard = { id: nextId, en, th, pos, example };
    const newDeck = [...store.deck, newCard];
    setStore((s) => ({
      ...s,
      deck: newDeck,
      cards: {
        ...s.cards,
        [nextId]: {
          ef: 2.5, interval: 0, due: todayKey(), correct: 0, wrong: 0, reps: 0,
          introduced: false, introducedOn: null,
        },
      },
    }));
    clearForm();
  }

  function startEdit(card) {
    setEditingId(card.id);
    setEn(card.en); setTh(card.th); setExample(card.example || ""); setPos(card.pos || "noun");
  }

  function updateWord() {
    if (!editingId) return;
    const newDeck = store.deck.map((c) =>
      c.id === editingId ? { ...c, en, th, example, pos } : c
    );
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

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = store.deck;

    if (query) {
      list = list.filter((c) => {
        const enL = c.en.toLowerCase();
        const thL = c.th.toLowerCase();
        const exL = (c.example || "").toLowerCase();
        if (field === "en") return enL.includes(query);
        if (field === "th") return thL.includes(query);
        return enL.includes(query) || thL.includes(query) || exL.includes(query);
      });
    }

    if (sort === "az") list = [...list].sort((a, b) => a.en.localeCompare(b.en));
    else if (sort === "za") list = [...list].sort((a, b) => b.en.localeCompare(a.en));
    else list = [...list].sort((a, b) => b.id - a.id); // newest

    return list;
  }, [store.deck, q, field, sort]);

  function highlight(str, query) {
    if (!query) return str;
    const i = str.toLowerCase().indexOf(query.toLowerCase());
    if (i === -1) return str;
    const before = str.slice(0, i);
    const hit = str.slice(i, i + query.length);
    const after = str.slice(i + query.length);
    return (
      <>
        {before}
        <mark className="px-0.5 rounded bg-amber-300/60 text-slate-900">{hit}</mark>
        {after}
      </>
    );
  }

  return (
    <Card>
      <div className="text-lg font-bold mb-4">Manage words</div>

      {/* Search & sort */}
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="size-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="w-full pl-8 pr-8 p-2 rounded bg-white text-black placeholder-slate-500"
            placeholder="Search (EN / TH / example)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-800"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <select
          className="rounded p-2 bg-white text-black"
          value={field}
          onChange={(e) => setField(e.target.value)}
        >
          <option value="all">Search in all fields</option>
          <option value="en">Only English</option>
          <option value="th">Only Thai</option>
        </select>

        <select
          className="rounded p-2 bg-white text-black"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="newest">Sort: Newest first</option>
          <option value="az">Sort: A → Z</option>
          <option value="za">Sort: Z → A</option>
        </select>
      </div>

      <div className="text-xs text-slate-300 mb-3">
        Showing <b>{filtered.length}</b> of <b>{store.deck.length}</b> words
      </div>

      {/* Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
        <input
          className="w-full p-2 bg-white text-black rounded placeholder-slate-500"
          placeholder="EN (word)"
          value={en}
          onChange={(e) => setEn(e.target.value)}
        />
        <input
          className="w-full p-2 bg-white text-black rounded placeholder-slate-500"
          placeholder="TH (meaning)"
          value={th}
          onChange={(e) => setTh(e.target.value)}
        />
        <input
          className="w-full p-2 bg-white text-black rounded placeholder-slate-500"
          placeholder="Example sentence (optional)"
          value={example}
          onChange={(e) => setExample(e.target.value)}
        />
        <select
          className="w-full p-2 bg-white text-black rounded"
          value={pos}
          onChange={(e) => setPos(e.target.value)}
        >
          <option value="noun">noun</option>
          <option value="verb">verb</option>
          <option value="adjective">adjective</option>
          <option value="adverb">adverb</option>
          <option value="noun/verb">noun/verb</option>
          <option value="phrasal verb">phrasal verb</option>
        </select>
      </div>

      <div className="flex gap-2 mb-6">
        {editingId ? (
          <>
            <button onClick={updateWord} className="px-4 py-2 bg-blue-500 rounded hover:bg-blue-600">
              Update
            </button>
            <button onClick={clearForm} className="px-4 py-2 bg-gray-500 rounded hover:bg-gray-600">
              Cancel
            </button>
          </>
        ) : (
          <button onClick={addWord} className="px-4 py-2 bg-green-500 rounded hover:bg-green-600">
            Add
          </button>
        )}
      </div>

      {/* List */}
      <div className="max-h-80 overflow-auto pr-1">
        <ul className="space-y-2">
          {filtered.map((item) => (
            <li
              key={item.id}
              className="flex justify-between items-center gap-3 bg-white/5 px-3 py-2 rounded-xl"
            >
              <span className="text-sm">
                <b>{highlight(item.en, q)}</b> — {highlight(item.th, q)}{" "}
                <i className="text-slate-300">({item.pos})</i>
                {item.example ? (
                  <span className="text-slate-300"> · “{highlight(item.example, q)}”</span>
                ) : null}
              </span>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => startEdit(item)}
                  className="px-2 py-1 bg-yellow-500 rounded hover:bg-yellow-600 text-sm"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteWord(item.id)}
                  className="px-2 py-1 bg-red-500 rounded hover:bg-red-600 text-sm"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

/* ----------------- CSV Import ----------------- */
function CSVImport({ store, setStore }) {
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
        if (!rows.length) {
          setError("CSV must include headers: en, th (optional: pos, example)");
          return;
        }
        const startId = (store.deck.at(-1)?.id || 0) + 1;
        const newCards = rows.map((r, i) => ({ id: startId + i, ...r }));
        const nextDeck = [...store.deck, ...newCards];
        const nextProgress = {};
        newCards.forEach((c) => {
          nextProgress[c.id] = {
            ef: 2.5, interval: 0, due: todayKey(), correct: 0, wrong: 0, reps: 0,
            introduced: false, introducedOn: null,
          };
        });
        setStore((s) => ({ ...s, deck: nextDeck, cards: { ...s.cards, ...nextProgress } }));
        setError("");
      } catch {
        setError("Failed to read file.");
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
        <button
          className="rounded-xl bg-white/10 hover:bg-white/20 px-4 py-2"
          onClick={() => fileRef.current?.click()}
        >
          Choose file
        </button>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFile} />
      </div>
      {error && <div className="text-rose-300 text-sm mt-2">{error}</div>}
      <div className="mt-4 text-sm text-slate-300">Total words: {store.deck.length}</div>
    </Card>
  );
}
