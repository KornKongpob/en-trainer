import React, { useRef, useState } from "react";

/* Keep CSV parser local to Settings */
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

export default function Settings({ store, setStore, scheduleNext, todayKey }) {
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
    <section className="grid grid-cols-1 gap-4">
      {/* SRS / Goals */}
      <Card>
        <div className="text-lg font-bold mb-4">Settings: SRS & Goals</div>
        <label className="block text-sm mb-1">Daily XP goal</label>
        <input type="number" min={10} step={5} value={goal} onChange={(e) => setGoal(e.target.value)} className="mb-4 w-full rounded p-2 bg-white text-black placeholder-slate-500" />

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
          <input type="number" min={0} value={dailyNew} onChange={(e) => setDailyNew(e.target.value)} className="w-32 rounded p-2 bg-white text-black" />
          <div className="text-xs text-slate-300 mt-1">Each day up to this many unintroduced words will enter the review queue.</div>
        </div>

        <div className="flex gap-2 mt-2">
          <button onClick={saveSettings} className="rounded bg-emerald-500 px-4 py-2 hover:bg-emerald-600">Save</button>
          <button onClick={rescheduleAll} className="rounded bg-white/10 border border-white/20 px-4 py-2 hover:bg-white/20">Recompute schedules</button>
        </div>
      </Card>

      {/* CSV Import */}
      <CSVImport store={store} setStore={setStore} todayKey={todayKey} />

      {/* Manage Words */}
      <ManageWords store={store} setStore={setStore} todayKey={todayKey} />
    </section>
  );

  function Card({ children }) { return (<div className="rounded-3xl border border-white/10 bg-white/5 p-4">{children}</div>); }

  function CSVImport({ store, setStore, todayKey }) {
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
          const nextIdStart = (store.deck.at(-1)?.id || 0) + 1;
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

  function ManageWords({ store, setStore, todayKey }) {
    const [en, setEn] = useState("");
    const [th, setTh] = useState("");
    const [example, setExample] = useState("");
    const [pos, setPos] = useState("noun");
    const [editingId, setEditingId] = useState(null);

    function clearForm(){ setEn(""); setTh(""); setExample(""); setPos("noun"); setEditingId(null); }
    function addWord(){
      if(!en.trim() || !th.trim()) return alert("Please enter EN and TH.");
      const nextId = (store.deck.at(-1)?.id || 0) + 1;
      const newCard = { id: nextId, en, th, pos, example };
      const newDeck = [...store.deck, newCard];
      setStore((s)=>({
        ...s,
        deck: newDeck,
        cards: { ...s.cards, [nextId]: { ef:2.5, interval:0, due: todayKey(), correct:0, wrong:0, reps:0, introduced:false, introducedOn:null } }
      }));
      clearForm();
    }
    function startEdit(card){ setEditingId(card.id); setEn(card.en); setTh(card.th); setExample(card.example||""); setPos(card.pos||"noun"); }
    function updateWord(){
      if(!editingId) return;
      const newDeck = store.deck.map((c)=> c.id===editingId ? { ...c, en, th, example, pos } : c);
      setStore((s)=> ({ ...s, deck: newDeck })); clearForm();
    }
    function deleteWord(id){
      if(!confirm("Delete this word?")) return;
      const newDeck = store.deck.filter((c)=> c.id!==id);
      const newCards = { ...store.cards }; delete newCards[id];
      setStore((s)=> ({ ...s, deck: newDeck, cards: newCards })); if(editingId===id) clearForm();
    }

    return (
      <Card>
        <div className="text-lg font-bold mb-4">Manage words</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
          <input className="w-full p-2 bg-white text-black rounded placeholder-slate-500" placeholder="EN (word)" value={en} onChange={(e)=>setEn(e.target.value)} />
          <input className="w-full p-2 bg-white text-black rounded placeholder-slate-500" placeholder="TH (meaning)" value={th} onChange={(e)=>setTh(e.target.value)} />
          <input className="w-full p-2 bg-white text-black rounded placeholder-slate-500" placeholder="Example sentence (optional)" value={example} onChange={(e)=>setExample(e.target.value)} />
          <select className="w-full p-2 bg-white text-black rounded" value={pos} onChange={(e)=>setPos(e.target.value)}>
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
            {store.deck.map((item)=>(
              <li key={item.id} className="flex justify-between items-center gap-3 bg-white/5 px-3 py-2 rounded-xl">
                <span className="text-sm">
                  <b>{item.en}</b> — {item.th} <i className="text-slate-300">({item.pos})</i>
                  {item.example ? <span className="text-slate-300"> · “{item.example}”</span> : null}
                </span>
                <div className="flex gap-2 shrink-0">
                  <button onClick={()=>startEdit(item)} className="px-2 py-1 bg-yellow-500 rounded hover:bg-yellow-600 text-sm">Edit</button>
                  <button onClick={()=>deleteWord(item.id)} className="px-2 py-1 bg-red-500 rounded hover:bg-red-600 text-sm">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    );
  }

  function Card({ children }) { return (<div className="rounded-3xl border border-white/10 bg-white/5 p-4">{children}</div>); }
}
