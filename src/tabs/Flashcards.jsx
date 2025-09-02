// src/tabs/Flashcards.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Volume2 } from "lucide-react";
import {
  safeProgress,
  previewLabel,
  applyGradeUpdate,
  todayKey,
  nowMs,
  MS,
  humanizeMs,
} from "../srs/engine";

const classNames = (...a) => a.filter(Boolean).join(" ");

function Card({ children }) {
  return <div className="rounded-3xl border border-white/10 bg-white/5 p-4">{children}</div>;
}

export default function Flashcards({ store, setStore, onXP, ttsSpeak }) {
  // Pre-warm voices (helps Safari / first-time click)
  useEffect(() => {
    try {
      const synth = window?.speechSynthesis;
      if (!synth) return;
      const v = synth.getVoices?.();
      if (!v || !v.length) {
        const prev = synth.onvoiceschanged;
        synth.onvoiceschanged = () => {
          if (prev) {
            try { prev(); } catch {}
          }
          synth.getVoices?.();
          synth.onvoiceschanged = null;
        };
      }
    } catch {}
  }, []);

  // Build due list safely (due NOW)
  const dueCards = useMemo(() => {
    const deck = Array.isArray(store?.deck) ? store.deck : [];
    const cards = store?.cards || {};
    return deck.filter((c) => {
      const p = safeProgress(cards[c.id]);
      if (!p.introduced) return false;
      if (typeof p.dueAt === "number") return p.dueAt <= nowMs();
      return (p.due ?? todayKey()) <= todayKey();
    });
  }, [store?.deck, store?.cards]);

  // Count everything due WITHIN 24h (including current)
  const within24hCount = useMemo(() => {
    const deck = Array.isArray(store?.deck) ? store.deck : [];
    const cards = store?.cards || {};
    const now = nowMs();
    return deck.reduce((acc, c) => {
      const p = safeProgress(cards[c.id]);
      if (!p.introduced) return acc;
      const dueAt = typeof p.dueAt === "number" ? p.dueAt : now;
      if (dueAt - now <= MS.day) acc += 1;
      return acc;
    }, 0);
  }, [store?.deck, store?.cards]);

  const [show, setShow] = useState(false);
  const card = dueCards[0] || null;
  const prog = safeProgress(card ? store?.cards?.[card.id] : null);

  // latency capture (time to "See translation")
  const viewStartRef = useRef(null);
  const measuredLatencyRef = useRef(null);

  useEffect(() => {
    setShow(false);
    measuredLatencyRef.current = null;
    viewStartRef.current = Date.now();
  }, [card?.id]);

  if (!card) {
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

  function onShowTranslation() {
    if (measuredLatencyRef.current == null && viewStartRef.current != null) {
      measuredLatencyRef.current = Date.now() - viewStartRef.current;
    }
    setShow(true);
  }

  function applyGrade(grade) {
    let latency = measuredLatencyRef.current;
    if (latency == null && viewStartRef.current != null) {
      latency = Date.now() - viewStartRef.current;
      measuredLatencyRef.current = latency;
    }

    const settingsPack = {
      intervals: store?.intervals,
      day1: store?.day1,
      day2: store?.day2,
      timing: store?.timing,
      penalties: store?.penalties,
    };

    const updated = applyGradeUpdate(prog, grade, settingsPack, latency);

    setStore((s) => ({ ...s, cards: { ...(s.cards || {}), [card.id]: updated } }));
    onXP?.(grade === "good" || grade === "easy" ? 10 : 4);
    setShow(false);
  }

  const settingsPack = {
    intervals: store?.intervals,
    day1: store?.day1,
    day2: store?.day2,
    timing: store?.timing,
    penalties: store?.penalties,
  };
  const lblAgain = previewLabel(prog, "again", settingsPack);
  const lblHard  = previewLabel(prog, "hard", settingsPack);
  const lblGood  = previewLabel(prog, "good", settingsPack);
  const lblEasy  = previewLabel(prog, "easy", settingsPack);

  const dueInText = (() => {
    const delta = Math.max(0, (prog?.dueAt ?? nowMs()) - nowMs());
    return humanizeMs(delta);
  })();

  const positionLabel = `1/${dueCards.length}`;

  function speakPreferred(text) {
    try {
      if (typeof ttsSpeak === "function") { ttsSpeak(text, "en-US"); return; }
    } catch {}
    try {
      const synth = window.speechSynthesis; if (!synth) return;
      const u = new SpeechSynthesisUtterance(String(text)); u.lang = "en-US"; synth.speak(u);
    } catch {}
  }

  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 min-h-[60dvh] sm:min-h-[320px] flex flex-col">
          <div className="flex items-center justify-between text-sm text-slate-300">
            <span>Card {positionLabel}</span>
            <span>
              Left in queue now: <b>{Math.max(0, within24hCount - 1)}</b>
            </span>
          </div>

          <div className="mt-2 text-4xl font-extrabold tracking-tight break-words">{card.en}</div>
          <div className="text-sm text-slate-400">{card.pos}</div>

          {!show && (
            <div className="mt-6 flex items-center gap-2">
              <button
                onClick={() => speakPreferred(card.en)}
                className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 px-3 py-1 text-sm"
              >
                <Volume2 className="size-4" /> Listen (EN)
              </button>
            </div>
          )}

          {show && (
            <div className="mt-6 space-y-2">
              <div className="text-xl">{card.th}</div>
              {card.example ? (
                <div className="text-sm text-slate-300">Example: <i>{card.example}</i></div>
              ) : null}
              {card.syn ? (
                <div className="text-sm text-emerald-200/90">
                  <span className="font-semibold">Synonyms:</span> {card.syn}
                </div>
              ) : null}
            </div>
          )}

          <div className="mt-auto pt-6 space-y-3">
            {/* Flip first */}
            <button
              onClick={onShowTranslation}
              disabled={show}
              className={classNames(
                "w-full sm:w-auto rounded-xl px-4 py-3 text-center",
                show ? "bg-white/10 cursor-not-allowed" : "bg-emerald-500/20 hover:bg-emerald-500/30"
              )}
            >
              See translation
            </button>

            {/* Grade buttons only AFTER reveal */}
            {show && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <button onClick={() => applyGrade("again")} className="w-full rounded-xl bg-white/10 hover:bg-white/20 px-4 py-3">
                  Again ({lblAgain})
                </button>
                <button onClick={() => applyGrade("hard")} className="w-full rounded-xl bg-white/10 hover:bg-white/20 px-4 py-3">
                  Hard ({lblHard})
                </button>
                <button onClick={() => applyGrade("good")} className="w-full rounded-xl bg-amber-500/20 hover:bg-amber-500/30 px-4 py-3">
                  Good ({lblGood})
                </button>
                <button onClick={() => applyGrade("easy")} className="w-full rounded-xl bg-emerald-500/30 hover:bg-emerald-500/40 px-4 py-3">
                  Easy ({lblEasy})
                </button>
              </div>
            )}

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
              <div className="text-xl font-bold">{prog.correct ?? 0}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className="text-xs text-slate-400">Wrong</div>
              <div className="text-xl font-bold">{prog.wrong ?? 0}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className="text-xs text-slate-400">EF</div>
              <div className="text-xl font-bold">{(prog.ef ?? 2.5).toFixed(2)}</div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
