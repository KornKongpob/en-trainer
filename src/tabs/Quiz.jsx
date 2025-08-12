// src/tabs/Quiz.jsx
import React, { useState } from "react";
import { Volume2 } from "lucide-react";

/** tiny helpers */
const cn = (...a) => a.filter(Boolean).join(" ");
const speak = (text, lang = "en-US") => {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {}
};

export default function Quiz({ store, setStore, onXP }) {
  const [mode, setMode] = useState("mc");           // "mc" | "type"
  const [dir, setDir] = useState("en-th");          // "en-th" | "th-en"
  const [count, setCount] = useState(10);

  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);

  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [score, setScore] = useState(0);

  // MC feedback state
  const [selectedOpt, setSelectedOpt] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const canStart = (store.deck?.length ?? 0) >= Math.min(4, count);

  /** util: shuffle + pickN */
  const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
  const pickN = (arr, n) => shuffle(arr).slice(0, n);

  function buildQuestions() {
    const deck = store.deck || [];
    const base = pickN(deck, Math.min(count, deck.length));

    const qs = base.map((item) => {
      const prompt = dir === "en-th" ? item.en : item.th;
      const answer = dir === "en-th" ? item.th : item.en;

      if (mode === "mc") {
        const pool = deck
          .filter((d) => d.id !== item.id)
          .map((d) => (dir === "en-th" ? d.th : d.en));

        // ensure unique distractors and avoid duplicating the answer
        const uniquePool = Array.from(new Set(pool)).filter((x) => x !== answer);
        const distractors = pickN(uniquePool, 3);
        const options = shuffle([answer, ...distractors]).slice(0, 4); // up to 4 options

        return { type: "mc", prompt, answer, options, item };
      }

      // typing question
      return { type: "type", prompt, answer, item };
    });

    setQuestions(qs);
  }

  function start() {
    buildQuestions();
    setScore(0);
    setQIndex(0);
    setDone(false);
    setStarted(true);
    setSelectedOpt(null);
    setShowFeedback(false);
  }

  function archiveAndFinish(finalScore) {
    const total = questions.length;
    const correct = finalScore;
    const accuracy = total ? Math.round((correct / total) * 100) : 0;
    const entry = { date: new Date().toISOString(), mode, dir, total, correct, accuracy };
    setStore((s) => ({ ...s, quizHistory: [...(s.quizHistory || []), entry] }));
  }

  function goNext(newScore) {
    if (qIndex + 1 >= questions.length) {
      setStarted(false);
      setDone(true);
      archiveAndFinish(newScore);
      return;
    }
    setQIndex((i) => i + 1);
    setSelectedOpt(null);
    setShowFeedback(false);
  }

  /** Multiple choice handler with instant feedback */
  function submitMC(opt) {
    if (showFeedback) return; // ignore multi-click
    const q = questions[qIndex];
    const correct = opt === q.answer;

    setSelectedOpt(opt);
    setShowFeedback(true);

    const nextScore = score + (correct ? 1 : 0);
    onXP?.(correct ? 6 : 2);

    // Show colors briefly, then advance
    setTimeout(() => {
      setScore(nextScore);
      goNext(nextScore);
    }, 800);
  }

  /** Typing mode */
  function submitType(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const val = String(form.get("ans") || "").trim().toLowerCase();
    const q = questions[qIndex];
    const correct = val === String(q.answer).trim().toLowerCase();

    const nextScore = score + (correct ? 1 : 0);
    onXP?.(correct ? 8 : 2);
    e.currentTarget.reset();

    setScore(nextScore);
    goNext(nextScore);
  }

  /** UI STATES */
  if (!started && !done) {
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
              <button
                className={cn("px-3 py-2 rounded", mode === "mc" ? "bg-emerald-500/30" : "bg-white/10 hover:bg-white/20")}
                onClick={() => setMode("mc")}
              >
                Multiple choice
              </button>
              <button
                className={cn("px-3 py-2 rounded", mode === "type" ? "bg-emerald-500/30" : "bg-white/10 hover:bg-white/20")}
                onClick={() => setMode("type")}
              >
                Type answer
              </button>
            </div>
          </div>

          <div>
            <div className="text-sm mb-1">Direction</div>
            <div className="flex gap-2">
              <button
                className={cn("px-3 py-2 rounded", dir === "en-th" ? "bg-emerald-500/30" : "bg-white/10 hover:bg-white/20")}
                onClick={() => setDir("en-th")}
              >
                EN → TH
              </button>
              <button
                className={cn("px-3 py-2 rounded", dir === "th-en" ? "bg-emerald-500/30" : "bg-white/10 hover:bg-white/20")}
                onClick={() => setDir("th-en")}
              >
                TH → EN
              </button>
            </div>
          </div>

          <div>
            <div className="text-sm mb-1">Number of questions</div>
            <input
              type="number"
              min={5}
              max={50}
              step={5}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full rounded p-2 bg-white text-black placeholder-slate-500"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            disabled={!canStart}
            onClick={start}
            className={cn("px-4 py-2 rounded", canStart ? "bg-emerald-500 hover:bg-emerald-600" : "bg-white/10 cursor-not-allowed")}
          >
            Start
          </button>
          {!canStart && <span className="text-xs text-rose-300">Need at least 4 words</span>}
        </div>

        {!!(store.quizHistory?.length || 0) && (
          <div className="mt-6">
            <div className="text-sm text-slate-400 mb-2">Recent quiz history</div>
            <ul className="space-y-1 text-sm">
              {store.quizHistory.slice(-5).reverse().map((h, i) => (
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

  if (started) {
    const q = questions[qIndex];

    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-slate-400">Question {qIndex + 1}/{questions.length}</div>
          <div className="text-sm">Score: <b>{score}</b></div>
        </div>

        <div className="text-xl font-bold mb-3">{q.prompt}</div>

        <div className="mb-4">
          <button
            onClick={() => speak(dir === "en-th" ? q.item.en : q.item.th, dir === "en-th" ? "en-US" : "th-TH")}
            className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 px-3 py-1 text-sm"
          >
            <Volume2 className="size-4" /> Listen
          </button>
        </div>

        {q.type === "mc" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {q.options.map((opt, i) => {
              const isCorrect = showFeedback && opt === q.answer;
              const isWrongPick = showFeedback && opt === selectedOpt && opt !== q.answer;

              return (
                <button
                  key={i}
                  onClick={() => submitMC(opt)}
                  disabled={showFeedback}
                  className={cn(
                    "rounded-xl px-4 py-3 text-left border",
                    showFeedback
                      ? isCorrect
                        ? "bg-emerald-600/30 border-emerald-400"
                        : isWrongPick
                        ? "bg-rose-600/30 border-rose-400"
                        : "bg-white/10 border-white/10"
                      : "bg-white/10 hover:bg-white/20 border-white/10"
                  )}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        ) : (
          <form onSubmit={submitType} className="flex gap-2">
            <input
              name="ans"
              autoFocus
              className="flex-1 rounded p-2 bg-white text-black placeholder-slate-500"
              placeholder="Type your answer"
            />
            <button type="submit" className="rounded bg-emerald-500 px-4 py-2 hover:bg-emerald-600">
              Submit
            </button>
          </form>
        )}
      </div>
    );
  }

  // Done (summary) — use last history entry we just wrote
  const lastHist = (store.quizHistory || [])[store.quizHistory.length - 1];

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <div className="text-lg font-bold mb-2">Summary</div>
      {lastHist && (
        <div className="mb-2 text-sm text-slate-300">
          {new Date(lastHist.date).toLocaleString()} · {lastHist.mode} · {lastHist.dir}
        </div>
      )}
      <div className="text-2xl font-bold mb-3">
        Score: {lastHist?.correct ?? score}/{lastHist?.total ?? questions.length} ({lastHist?.accuracy ?? 0}%)
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => { setDone(false); setStarted(false); }}
          className="rounded bg-white/10 px-4 py-2 hover:bg-white/20"
        >
          Change options
        </button>
        <button onClick={start} className="rounded bg-emerald-500 px-4 py-2 hover:bg-emerald-600">
          Restart
        </button>
      </div>
    </div>
  );
}
