// src/tabs/Settings.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

const classNames = (...a) => a.filter(Boolean).join(" ");
const last = (arr) => (Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null);
const toKeyDate = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const todayKey = () => toKeyDate();

function Card({ children }) {
  return <div className="rounded-3xl border border-white/10 bg-white/5 p-4">{children}</div>;
}

export default function Settings({ store, setStore }) {
  const [tab, setTab] = useState("general"); // general | day1 | timing | penalties | audio | import | manage

  return (
    <Card>
      <div className="text-lg font-bold mb-4">Settings</div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setTab("general")} className={classNames("px-3 py-2 rounded", tab === "general" ? "bg-emerald-500/30" : "bg-white/10 hover:bg-white/20")}>General</button>
        <button onClick={() => setTab("day1")} className={classNames("px-3 py-2 rounded", tab === "day1" ? "bg-emerald-500/30" : "bg-white/10 hover:bg-white/20")}>Day-1 & Day-2</button>
        <button onClick={() => setTab("timing")} className={classNames("px-3 py-2 rounded", tab === "timing" ? "bg-emerald-500/30" : "bg-white/10 hover:bg-white/20")}>Timing</button>
        <button onClick={() => setTab("penalties")} className={classNames("px-3 py-2 rounded", tab === "penalties" ? "bg-emerald-500/30" : "bg-white/10 hover:bg-white/20")}>Penalties</button>
        <button onClick={() => setTab("audio")} className={classNames("px-3 py-2 rounded", tab === "audio" ? "bg-emerald-500/30" : "bg-white/10 hover:bg-white/20")}>Audio / TTS</button>
        <button onClick={() => setTab("import")} className={classNames("px-3 py-2 rounded", tab === "import" ? "bg-emerald-500/30" : "bg-white/10 hover:bg-white/20")}>Import CSV</button>
        <button onClick={() => setTab("manage")} className={classNames("px-3 py-2 rounded", tab === "manage" ? "bg-emerald-500/30" : "bg-white/10 hover:bg-white/20")}>Manage Words</button>
      </div>

      {tab === "general" && <GeneralSettings store={store} setStore={setStore} />}
      {tab === "day1" && <Day12Settings store={store} setStore={setStore} />}
      {tab === "timing" && <TimingSettings store={store} setStore={setStore} />}
      {tab === "penalties" && <PenaltySettings store={store} setStore={setStore} />}
      {tab === "audio" && <AudioSettings store={store} setStore={setStore} />}
      {tab === "import" && <ContentManager store={store} setStore={setStore} />}
      {tab === "manage" && <ManageWords store={store} setStore={setStore} />}
    </Card>
  );
}

/* =============== General =============== */
function GeneralSettings({ store, setStore }) {
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

  return (
    <>
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
        <div className="text-xs text-slate-300">Affects SM-2 after Day-2. EF adapts spacing over time.</div>
        <div className="text-xs text-amber-300 mt-1">Note: Even if Easy and Good base days are equal, the app will schedule <b>Easy at least 1 day further</b> than Good on Day-3+.</div>
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
      </div>
    </>
  );
}

/* =============== Day-1 & Day-2 =============== */
function Day12Settings({ store, setStore }) {
  const [d1Again, setD1Again] = useState(store.day1?.againMins ?? 5);
  const [d1Hard, setD1Hard] = useState(store.day1?.hardMins ?? 10);
  const [d1Good, setD1Good] = useState(store.day1?.goodDays ?? 1);
  const [d1Easy, setD1Easy] = useState(store.day1?.easyDays ?? 2);

  const [d2Again, setD2Again] = useState(store.day2?.againMins ?? 5);
  const [d2Hard, setD2Hard] = useState(store.day2?.hardMins ?? 15);
  const [d2Good, setD2Good] = useState(store.day2?.goodDays ?? 1);
  const [d2Easy, setD2Easy] = useState(store.day2?.easyDays ?? 2);

  // Live guards: Easy must always be at least Good + 1
  const onChangeD1Good = (val) => {
    const v = Math.max(1, Number(val));
    setD1Good(v);
    if (Number(d1Easy) <= v) setD1Easy(v + 1);
  };
  const onChangeD1Easy = (val) => {
    let v = Math.max(1, Number(val));
    const min = Number(d1Good) + 1;
    if (v <= min) v = min;
    setD1Easy(v);
  };
  const onChangeD2Good = (val) => {
    const v = Math.max(1, Number(val));
    setD2Good(v);
    if (Number(d2Easy) <= v) setD2Easy(v + 1);
  };
  const onChangeD2Easy = (val) => {
    let v = Math.max(1, Number(val));
    const min = Number(d2Good) + 1;
    if (v <= min) v = min;
    setD2Easy(v);
  };

  function save() {
    // Final guard on save (in case of any race conditions)
    const safeD1Good = Math.max(1, Number(d1Good));
    const safeD1Easy = Math.max(safeD1Good + 1, Number(d1Easy));
    const safeD2Good = Math.max(1, Number(d2Good));
    const safeD2Easy = Math.max(safeD2Good + 1, Number(d2Easy));

    setStore((s) => ({
      ...s,
      day1: {
        againMins: Math.max(1, Number(d1Again)),
        hardMins: Math.max(1, Number(d1Hard)),
        goodDays: safeD1Good,
        easyDays: safeD1Easy,
      },
      day2: {
        againMins: Math.max(1, Number(d2Again)),
        hardMins: Math.max(1, Number(d2Hard)),
        goodDays: safeD2Good,
        easyDays: safeD2Easy,
      },
    }));
  }

  return (
    <>
      <div className="text-sm mb-2">Day-1 timings</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex items-center gap-2">Again (minutes)
          <input type="number" min={1} className="w-24 rounded p-2 bg-white text-black" value={d1Again} onChange={(e) => setD1Again(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-2">Hard (minutes)
          <input type="number" min={1} className="w-24 rounded p-2 bg-white text-black" value={d1Hard} onChange={(e) => setD1Hard(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-2">Good (days)
          <input type="number" min={1} className="w-24 rounded p-2 bg-white text-black" value={d1Good} onChange={(e) => onChangeD1Good(e.target.value)} />
        </label>
        <label className="flex items-center gap-2">Easy (days)
          <input type="number" min={2} className="w-24 rounded p-2 bg-white text-black" value={d1Easy} onChange={(e) => onChangeD1Easy(e.target.value)} />
        </label>
      </div>
      <div className="text-xs text-amber-300 mt-1">Rule: On Day-1, <b>Easy</b> will be saved as at least <b>Good + 1</b> day.</div>

      <div className="text-sm mt-5 mb-2">Day-2 timings</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex items-center gap-2">Again (minutes)
          <input type="number" min={1} className="w-24 rounded p-2 bg-white text-black" value={d2Again} onChange={(e) => setD2Again(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-2">Hard (minutes)
          <input type="number" min={1} className="w-24 rounded p-2 bg-white text-black" value={d2Hard} onChange={(e) => setD2Hard(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-2">Good (days)
          <input type="number" min={1} className="w-24 rounded p-2 bg-white text-black" value={d2Good} onChange={(e) => onChangeD2Good(e.target.value)} />
        </label>
        <label className="flex items-center gap-2">Easy (days)
          <input type="number" min={2} className="w-24 rounded p-2 bg-white text-black" value={d2Easy} onChange={(e) => onChangeD2Easy(e.target.value)} />
        </label>
      </div>
      <div className="text-xs text-amber-300 mt-1">Rule: On Day-2, <b>Easy</b> will be saved as at least <b>Good + 1</b> day.</div>

      <div className="mt-3">
        <button onClick={save} className="rounded bg-emerald-500 px-4 py-2 hover:bg-emerald-600">Save Day-1/2 timings</button>
      </div>
    </>
  );
}

/* =============== Timing thresholds (Day-3+) =============== */
function TimingSettings({ store, setStore }) {
  const [fastMs, setFastMs] = useState(store.timing?.fastMs ?? 5000);
  const [slowMs, setSlowMs] = useState(store.timing?.slowMs ?? 25000);
  const [clampMin, setClampMin] = useState(store.timing?.clampMin ?? 0.75);
  const [clampMax, setClampMax] = useState(store.timing?.clampMax ?? 1.25);

  function save() {
    setStore((s) => ({
      ...s,
      timing: {
        fastMs: Math.max(0, Number(fastMs)),
        slowMs: Math.max(1, Number(slowMs)),
        clampMin: Number(clampMin),
        clampMax: Number(clampMax),
      }
    }));
  }

  return (
    <>
      <div className="text-sm mb-2">Timing → affects Day-3+ Hard/Good/Easy via a factor:</div>
      <ul className="text-sm text-slate-300 list-disc pl-5 mb-3">
        <li>≤ <b>fastMs</b> → max boost (<b>clampMax</b>)</li>
        <li>≥ <b>slowMs</b> → max shrink (<b>clampMin</b>)</li>
        <li>Linear blend between</li>
      </ul>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex items-center gap-2">fastMs
          <input type="number" min={0} className="w-28 rounded p-2 bg-white text-black" value={fastMs} onChange={(e) => setFastMs(e.target.value)} />
        </label>
        <label className="flex items-center gap-2">slowMs
          <input type="number" min={1} className="w-28 rounded p-2 bg-white text-black" value={slowMs} onChange={(e) => setSlowMs(e.target.value)} />
        </label>
        <label className="flex items-center gap-2">clampMin
          <input type="number" step="0.01" className="w-28 rounded p-2 bg-white text-black" value={clampMin} onChange={(e) => setClampMin(e.target.value)} />
        </label>
        <label className="flex items-center gap-2">clampMax
          <input type="number" step="0.01" className="w-28 rounded p-2 bg-white text-black" value={clampMax} onChange={(e) => setClampMax(e.target.value)} />
        </label>
      </div>

      <div className="text-xs text-slate-400 mt-2">Typical: fast=5000, slow=25000, clampMin=0.75, clampMax=1.25</div>

      <div className="mt-3">
        <button onClick={save} className="rounded bg-emerald-500 px-4 py-2 hover:bg-emerald-600">Save timing</button>
      </div>
    </>
  );
}

/* =============== Penalties (NEW) =============== */
function PenaltySettings({ store, setStore }) {
  const defaults = {
    day3AgainMins: 15,
    l1: { hard: 0.40, good: 0.60, easy: 0.60 },
    l2plus: { hard: 0.25, good: 0.50, easy: 0.50 },
    maxLevel: 10,
    compoundAfterL1: false,
  };
  const p0 = store.penalties || defaults;

  const [day3AgainMins, setDay3AgainMins] = useState(p0.day3AgainMins ?? 15);
  const [l1Hard, setL1Hard] = useState(p0.l1?.hard ?? 0.40);
  const [l1Good, setL1Good] = useState(p0.l1?.good ?? 0.60);
  const [l1Easy, setL1Easy] = useState(p0.l1?.easy ?? 0.60);
  const [l2Hard, setL2Hard] = useState(p0.l2plus?.hard ?? 0.25);
  const [l2Good, setL2Good] = useState(p0.l2plus?.good ?? 0.50);
  const [l2Easy, setL2Easy] = useState(p0.l2plus?.easy ?? 0.50);
  const [maxLevel, setMaxLevel] = useState(p0.maxLevel ?? 10);
  const [compoundAfterL1, setCompoundAfterL1] = useState(!!p0.compoundAfterL1);

  function save() {
    setStore((s) => ({
      ...s,
      penalties: {
        day3AgainMins: Math.max(1, Number(day3AgainMins)),
        l1: { hard: +l1Hard, good: +l1Good, easy: +l1Easy },
        l2plus: { hard: +l2Hard, good: +l2Good, easy: +l2Easy },
        maxLevel: Math.max(1, Number(maxLevel)),
        compoundAfterL1: !!compoundAfterL1,
      },
    }));
  }

  return (
    <>
      <div className="text-sm mb-3">
        Controls how much the next interval shrinks on Day-3+ when you press <b>Again</b> (and then choose Hard/Good/Easy afterwards).
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <div className="font-semibold mb-2">Day-3+ “Again” delay</div>
          <label className="flex items-center gap-2">
            Again delay (minutes):
            <input type="number" min={1} className="w-28 rounded p-2 bg-white text-black"
                   value={day3AgainMins} onChange={(e) => setDay3AgainMins(e.target.value)} />
          </label>
          <div className="text-xs text-slate-400 mt-1">After pressing Again on Day-3+, the card returns after this fixed delay.</div>
        </Card>

        <Card>
          <div className="font-semibold mb-2">Level-1 multipliers (first Again today)</div>
          <div className="grid grid-cols-3 gap-2 items-end">
            <label className="text-sm">Hard
              <input type="number" step="0.01" min="0.05" max="1" className="w-full mt-1 rounded p-2 bg-white text-black" value={l1Hard} onChange={(e) => setL1Hard(e.target.value)} />
            </label>
            <label className="text-sm">Good
              <input type="number" step="0.01" min="0.05" max="1" className="w-full mt-1 rounded p-2 bg-white text-black" value={l1Good} onChange={(e) => setL1Good(e.target.value)} />
            </label>
            <label className="text-sm">Easy
              <input type="number" step="0.01" min="0.05" max="1" className="w-full mt-1 rounded p-2 bg-white text-black" value={l1Easy} onChange={(e) => setL1Easy(e.target.value)} />
            </label>
          </div>
        </Card>

        <Card>
          <div className="font-semibold mb-2">Level ≥2 multipliers (second+ Again today)</div>
          <div className="grid grid-cols-3 gap-2 items-end">
            <label className="text-sm">Hard
              <input type="number" step="0.01" min="0.05" max="1" className="w-full mt-1 rounded p-2 bg-white text-black" value={l2Hard} onChange={(e) => setL2Hard(e.target.value)} />
            </label>
            <label className="text-sm">Good
              <input type="number" step="0.01" min="0.05" max="1" className="w-full mt-1 rounded p-2 bg-white text-black" value={l2Good} onChange={(e) => setL2Good(e.target.value)} />
            </label>
            <label className="text-sm">Easy
              <input type="number" step="0.01" min="0.05" max="1" className="w-full mt-1 rounded p-2 bg-white text-black" value={l2Easy} onChange={(e) => setL2Easy(e.target.value)} />
            </label>
          </div>
          <label className="flex items-center gap-2 mt-3">
            <input type="checkbox" checked={compoundAfterL1} onChange={(e) => setCompoundAfterL1(e.target.checked)} />
            Compound L2+ (apply ^level)
          </label>
          <div className="text-xs text-slate-400 mt-1">If checked, level≥2 applies multiplier^(level−1). Otherwise it uses the same L2+ multiplier for all further Agains.</div>
        </Card>

        <Card>
          <div className="font-semibold mb-2">Safety</div>
          <label className="flex items-center gap-2">
            Max penalty level per day:
            <input type="number" min={1} className="w-28 rounded p-2 bg-white text-black"
                   value={maxLevel} onChange={(e) => setMaxLevel(e.target.value)} />
          </label>
          <div className="text-xs text-slate-400 mt-1">Caps how much penalties escalate in a single day.</div>
        </Card>
      </div>

      <div className="mt-4">
        <button onClick={save} className="rounded bg-emerald-500 px-4 py-2 hover:bg-emerald-600">Save penalties</button>
      </div>
    </>
  );
}

/* =============== Audio / TTS =============== */
function AudioSettings({ store, setStore }) {
  const [voices, setVoices] = useState([]);
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const update = () => {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length) setVoices(v);
    };
    update();
    window.speechSynthesis.onvoiceschanged = update;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const tts = store.tts || { enVoice: "", thVoice: "", rate: 0.92, pitch: 1.0, volume: 1.0 };
  const enVoices = voices.filter(v => /^en(-|_|$)/i.test(v.lang || ""));
  const thVoices = voices.filter(v => /^th(-|_|$)/i.test(v.lang || ""));
  const setTTS = (patch) => setStore(s => ({ ...s, tts: { ...(s.tts || {}), ...patch } }));

  return (
    <>
      <div className="text-sm mb-2">Choose voices and defaults</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm">English voice
          <select className="mt-1 w-full rounded p-2 bg-white text-black"
                  value={tts.enVoice || ""}
                  onChange={(e) => setTTS({ enVoice: e.target.value })}>
            {enVoices.length
              ? enVoices.map(v => <option key={`${v.name}__${v.lang}`} value={`${v.name}__${v.lang}`}>{v.name} — {v.lang}</option>)
              : <option>(voices loading… click any Play once)</option>}
          </select>
        </label>
        <label className="text-sm">Thai voice
          <select className="mt-1 w-full rounded p-2 bg-white text-black"
                  value={tts.thVoice || ""}
                  onChange={(e) => setTTS({ thVoice: e.target.value })}>
            {thVoices.length
              ? thVoices.map(v => <option key={`${v.name}__${v.lang}`} value={`${v.name}__${v.lang}`}>{v.name} — {v.lang}</option>)
              : <option>(voices loading…)</option>}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        <label className="text-sm">Rate
          <input type="range" min="0.5" max="1.4" step="0.05" className="w-full"
                 value={Number(tts.rate ?? 0.92)}
                 onChange={(e) => setTTS({ rate: parseFloat(e.target.value) })} />
          <div className="text-xs text-slate-300">{Number(tts.rate ?? 0.92).toFixed(2)}x</div>
        </label>
        <label className="text-sm">Pitch
          <input type="range" min="0.8" max="1.2" step="0.02" className="w-full"
                 value={Number(tts.pitch ?? 1.0)}
                 onChange={(e) => setTTS({ pitch: parseFloat(e.target.value) })} />
          <div className="text-xs text-slate-300">{Number(tts.pitch ?? 1.0).toFixed(2)}</div>
        </label>
        <label className="text-sm">Volume
          <input type="range" min="0.5" max="1" step="0.05" className="w-full"
                 value={Number(tts.volume ?? 1.0)}
                 onChange={(e) => setTTS({ volume: parseFloat(e.target.value) })} />
          <div className="text-xs text-slate-300">{Math.round(Number(tts.volume ?? 1.0) * 100)}%</div>
        </label>
      </div>

      <div className="text-xs text-slate-400 mt-3">
        Tip: On Chrome, voices whose name starts with <b>Google</b> sound closest to Google Translate.
      </div>
    </>
  );
}

/* =============== Import CSV =============== */
// Headers: en, th, pos, example, sym (synonyms)
function parseCSV(text) {
  const t = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let i = 0, field = "", row = [], inQuotes = false;
  while (i < t.length) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; } }
      else field += c;
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
          replaceDup = window.confirm(`${duplicates.length} word(s) already exist. OK = REPLACE, Cancel = SKIP duplicates.`);
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
            ef: 2.5, interval: 0, due: todayKey(), dueAt: Date.now(),
            correct: 0, wrong: 0, reps: 0, reviews: 0, introduced: false, introducedOn: null,
            lastLatencyMs: null, avgLatencyMs: null, latencyCount: 0, latencyHistory: [],
            penaltyDateKey: null, penaltyLevelToday: 0,
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

/* =============== Manage Words =============== */
function ManageWords({ store, setStore }) {
  const [en, setEn] = useState("");
  const [th, setTh] = useState("");
  const [example, setExample] = useState("");
  const [pos, setPos] = useState("noun");
  const [syn, setSyn] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set());

  function addWord() {
    if (!en.trim() || !th.trim()) return alert("Please enter EN and TH.");
    const nextId = (store.deck[store.deck.length - 1]?.id || 0) + 1;
    const newCard = { id: nextId, en, th, pos, example, syn };
    const newDeck = [...store.deck, newCard];
    setStore((s) => ({
      ...s,
      deck: newDeck,
      cards: {
        ...s.cards,
        [nextId]: {
          ef: 2.5, interval: 0, due: todayKey(), dueAt: Date.now(),
          correct: 0, wrong: 0, reps: 0, reviews: 0, introduced: false, introducedOn: null,
          lastLatencyMs: null, avgLatencyMs: null, latencyCount: 0, latencyHistory: [],
          penaltyDateKey: null, penaltyLevelToday: 0,
        }
      }
    }));
    setEn(""); setTh(""); setExample(""); setPos("noun"); setSyn("");
  }

  function startEdit(card) {
    setEditingId(card.id);
    setEn(card.en); setTh(card.th); setExample(card.example || ""); setPos(card.pos || "noun"); setSyn(card.syn || "");
  }

  function updateWord() {
    if (!editingId) return;
    const newDeck = store.deck.map((c) => c.id === editingId ? { ...c, en, th, example, pos, syn } : c);
    setStore((s) => ({ ...s, deck: newDeck }));
    setEditingId(null); setEn(""); setTh(""); setExample(""); setPos("noun"); setSyn("");
  }

  function deleteWord(id) {
    if (!confirm("Delete this word?")) return;
    const newDeck = store.deck.filter((c) => c.id !== id);
    const newCards = { ...store.cards };
    delete newCards[id];
    setStore((s) => ({ ...s, deck: newDeck, cards: newCards }));
    if (editingId === id) { setEditingId(null); setEn(""); setTh(""); setExample(""); setPos("noun"); setSyn(""); }
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
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
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={!!allVisibleSelected} onChange={(e) => toggleSelectAllVisible(e.target.checked)} />
          Select all (visible)
        </label>
        {selected.size > 0 && (
          <button onClick={() => { const ids = Array.from(selected); ids.forEach(deleteWord); setSelected(new Set()); }} className="px-3 py-2 bg-red-500 rounded hover:bg-red-600 text-sm">
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
        <input className="w-full p-2 bg-white text-black rounded placeholder-slate-500 md:col-span-2" placeholder="Synonyms (comma-separated)" value={syn} onChange={(e) => setSyn(e.target.value)} />
      </div>

      <div className="flex gap-2 mb-6">
        {editingId ? (
          <>
            <button onClick={updateWord} className="px-4 py-2 bg-blue-500 rounded hover:bg-blue-600">Update</button>
            <button onClick={() => { setEditingId(null); setEn(""); setTh(""); setExample(""); setPos("noun"); setSyn(""); }} className="px-4 py-2 bg-gray-500 rounded hover:bg-gray-600">Cancel</button>
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
                  <input type="checkbox" checked={checked} onChange={(e) => toggleSelect(item.id, e.target.checked)} />
                </label>
                <span className="text-sm flex-1">
                  <b>{item.en}</b> — {item.th} <i className="text-slate-300">({item.pos})</i>
                  {item.example ? <span className="text-slate-300"> · “{item.example}”</span> : null}
                  {item.syn ? <span className="block text-xs text-emerald-300 mt-1">Syn: {item.syn}</span> : null}
                </span>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => { setEditingId(item.id); setEn(item.en); setTh(item.th); setExample(item.example || ""); setPos(item.pos || "noun"); setSyn(item.syn || ""); }} className="px-2 py-1 bg-yellow-500 rounded hover:bg-yellow-600 text-sm">Edit</button>
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
