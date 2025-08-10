import React, { useState } from "react";
import { Volume2 } from "lucide-react";

const classNames = (...a) => a.filter(Boolean).join(" ");

export default function Quiz({ store, setStore, onXP }) {
  const [mode, setMode] = useState("mc"); // mc | type
  const [dir, setDir] = useState("en-th"); // en-th | th-en
  const [count, setCount] = useState(10);
  const [started, setStarted] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [questions, setQuestions] = useState([]);

  const canStart = store.deck.length >= Math.min(4, count);
  const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
  const pickN = (arr, n) => shuffle(arr).slice(0, n);

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
    setScore(0); setQIndex(0); setStarted(true);
  }

  function next(correctInc) {
    if (typeof correctInc === "number") setScore((s) => s + correctInc);
    if (qIndex + 1 >= questions.length) {
      const total = questions.length;
      const correct = (typeof correctInc === "number" ? score + correctInc : score);
      const accuracy = total ? Math.round((correct / total) * 100) : 0;
      const entry = { date: new Date().toISOString(), mode, dir, total, correct, accuracy };
      setStore((s) => ({ ...s, quizHistory: [...(s.quizHistory || []), entry] }));
      setStarted(false);
      return;
    }
    setQIndex((i) => i + 1);
  }

  function submitMC(opt) {
    const q = questions[qIndex];
    const correct = opt === q.answer;
    onXP(correct ? 6 : 2);
    next(correct ? 1 : 0);
  }

  function submitType(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const val = String(form.get("ans") || "").trim().toLowerCase();
    const q = questions[qIndex];
    const correct = val === String(q.answer).trim().toLowerCase();
    onXP(correct ? 8 : 2);
    e.currentTarget.reset();
    next(correct ? 1 : 0);
  }

  if (!started) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
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
            <input type="number" min={5} max={50} step={5} value={count} onChange={(e)=>setCount(Number(e.target.value))} className="w-full rounded p-2 bg-white text-black placeholder-slate-500" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button disabled={!canStart} onClick={start} className={classNames("px-4 py-2 rounded", canStart?"bg-emerald-500 hover:bg-emerald-600":"bg-white/10 cursor-not-allowed")}>Start</button>
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
      </div>
    );
  }

  const q = questions[qIndex];
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-slate-400">Question {qIndex+1}/{questions.length}</div>
        <div className="text-sm">Score: <b>{score}</b></div>
      </div>
      <div className="text-xl font-bold mb-3">{q.prompt}</div>
      <div className="mb-4">
        <button onClick={()=> { try { const t = (dir==="en-th" ? q.item.en : q.item.th); const u = new SpeechSynthesisUtterance(t); u.lang = dir==="en-th"?"en-US":"th-TH"; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);} catch{} }} className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 px-3 py-1 text-sm"><Volume2 className="size-4"/> Listen</button>
      </div>
      {q.type === "mc" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {q.options.map((opt, i)=>(
            <button key={i} onClick={()=>submitMC(opt)} className="rounded-xl bg-white/10 hover:bg-white/20 px-4 py-3 text-left">{opt}</button>
          ))}
        </div>
      ) : (
        <form onSubmit={submitType} className="flex gap-2">
          <input name="ans" autoFocus className="flex-1 rounded p-2 bg-white text-black placeholder-slate-500" placeholder="Type your answer" />
          <button type="submit" className="rounded bg-emerald-500 px-4 py-2 hover:bg-emerald-600">Submit</button>
        </form>
      )}
    </div>
  );
}
