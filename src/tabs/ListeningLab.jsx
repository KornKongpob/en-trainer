// src/tabs/ListeningLab.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, Mic, Square, Play } from "lucide-react";
import {
  downloadVoice as piperDownload,
  speak as piperSpeak,
  stop as piperStop,
} from "../tts/piperClient";

const classNames = (...a) => a.filter(Boolean).join(" ");
function Card({ children }) {
  return <div className="rounded-3xl border border-white/10 bg-white/5 p-4">{children}</div>;
}
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const voiceToKey = (v) => `${v.name}__${v.lang}`;

export default function ListeningLab({ store, setStore, onXP }) {
  // ----- Source of text -----
  const [source, setSource] = useState("deck");
  const firstId = store.deck[0]?.id ?? null;
  const [selectedId, setSelectedId] = useState(firstId);
  const [customText, setCustomText] = useState("");

  // ----- Recognize/score -----
  const [recognized, setRecognized] = useState("");
  const [scorePct, setScorePct] = useState(null);

  // ----- Recording -----
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [audioURL, setAudioURL] = useState(null);
  const audioRef = useRef(null);

  // ----- System TTS state -----
  const [voices, setVoices] = useState([]);
  const [speaking, setSpeaking] = useState(false);
  const speakTokenRef = useRef(0); // cancel token to stop chains
  const [mode, setMode] = useState("normal"); // normal | slow | clarity | words
  const [repeat, setRepeat] = useState(1);
  const [loop, setLoop] = useState(false);

  // ----- Piper TTS state -----
  const [usePiper, setUsePiper] = useState(store.tts?.usePiper || false);
  const [piperVoice, setPiperVoice] = useState(store.tts?.piperVoiceId || "en_US-hfc_female-medium");
  const [piperPct, setPiperPct] = useState(0);
  const [piperReady, setPiperReady] = useState(false);

  // persist Piper toggles to store
  useEffect(() => {
    setStore?.((s) => ({
      ...s,
      tts: {
        enVoice: s.tts?.enVoice || "",
        thVoice: s.tts?.thVoice || "",
        rate: s.tts?.rate ?? 0.92,
        pitch: s.tts?.pitch ?? 1.0,
        volume: s.tts?.volume ?? 1.0,
        slowFirst: s.tts?.slowFirst ?? false,
        usePiper,
        piperVoiceId: piperVoice,
      },
    }));
  }, [usePiper, piperVoice, setStore]);

  // pre-download / cache Piper model when toggled or voice changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!usePiper) {
        setPiperReady(false);
        return;
      }
      setPiperReady(false);
      setPiperPct(0);
      try {
        await piperDownload(piperVoice, (p) => {
          if (!cancelled) setPiperPct(Math.round(p * 100));
        });
        if (!cancelled) setPiperReady(true);
      } catch (e) {
        console.warn("Piper download failed", e);
        if (!cancelled) setPiperReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [usePiper, piperVoice]);

  // Pull system TTS sliders from global settings (live)
  const rate = Number(store.tts?.rate ?? 0.92);
  const pitch = Number(store.tts?.pitch ?? 1.0);
  const volume = Number(store.tts?.volume ?? 1.0);

  // ====== STT support ======
  const Recognition =
    typeof window !== "undefined"
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;
  const supportsSTT = !!Recognition;

  // ====== Expected text ======
  const expected = useMemo(() => {
    if (source === "custom") return customText.trim();
    const card = store.deck.find((d) => d.id === selectedId);
    return card?.en ?? "";
  }, [source, customText, store.deck, selectedId]);

  // ====== Helpers ======
  function normalize(s) {
    return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function levenshtein(a, b) {
    const m = a.length,
      n = b.length;
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
    if (!A || !B) {
      setScorePct(null);
      return;
    }
    const dist = levenshtein(A, B);
    const denom = Math.max(A.length, B.length) || 1;
    const pct = Math.max(0, Math.round((1 - dist / denom) * 100));
    setScorePct(pct);
    if (pct >= 85) onXP?.(12);
    else onXP?.(5);
  }

  // ====== Voices: load & stay updated ======
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const updateList = () => {
      const list = window.speechSynthesis.getVoices();
      if (!list || !list.length) return;
      setVoices(list);
    };
    updateList();
    window.speechSynthesis.onvoiceschanged = updateList;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // choose a Google-like English voice by default, or user’s choice
  const currentVoice = useMemo(() => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    const list = synth?.getVoices?.() || voices || [];
    const prefKey = store.tts?.enVoice || "";
    let v = list.find((x) => x && voiceToKey(x) === prefKey);
    if (v) return v;
    const en = list.filter((x) => /^en(-|_|$)/i.test(x.lang || ""));
    const score = (x) => {
      const n = (x.name || "").toLowerCase();
      let s = 0;
      if (n.startsWith("google")) s += 5;
      if (n.includes("google")) s += 3;
      if (/en-us/i.test(x.lang)) s += 2;
      if (n.includes("enhanced")) s += 1;
      return s;
    };
    v = en.sort((a, b) => score(b) - score(a))[0] || list[0] || null;
    return v || null;
  }, [voices, store.tts?.enVoice]);

  // ====== System TTS engine ======
  const stopSpeech = () => {
    try {
      window.speechSynthesis?.cancel();
    } catch {}
    speakTokenRef.current += 1; // invalidate running speak loop
    setLoop(false);
    setSpeaking(false);
    // also stop Piper in case that’s playing
    piperStop();
  };

  async function speakOnce(text, { rate, pitch, volume, voice, token }) {
    return new Promise((resolve) => {
      try {
        const u = new SpeechSynthesisUtterance(text);
        if (voice) u.voice = voice;
        u.rate = rate;
        u.pitch = pitch;
        u.volume = volume;
        const onDone = () => resolve();
        u.onend = onDone;
        u.onerror = onDone;
        if (token !== speakTokenRef.current) return resolve(); // cancelled before speaking
        window.speechSynthesis.speak(u);
      } catch {
        resolve();
      }
    });
  }

  const wait = (ms, token) =>
    new Promise((r) => {
      const start = Date.now();
      const step = () => {
        if (token !== speakTokenRef.current) return r();
        if (Date.now() - start >= ms) return r();
        requestAnimationFrame(step);
      };
      step();
    });

  async function speakWithMode() {
    if (!expected) return;
    stopSpeech(); // cancel any previous queue and token
    const token = ++speakTokenRef.current;
    setSpeaking(true);

    const base = {
      rate,
      pitch,
      volume,
      voice: currentVoice,
      token,
    };

    try {
      do {
        for (let round = 0; round < (repeat || 1); round++) {
          if (token !== speakTokenRef.current) return; // cancelled
          if (mode === "slow") {
            await speakOnce(expected, { ...base, rate: clamp(rate - 0.2, 0.5, 1.4) });
          } else if (mode === "clarity") {
            await speakOnce(expected, { ...base, rate: clamp(rate - 0.2, 0.5, 1.4) });
            await wait(150, token);
            if (token !== speakTokenRef.current) return;
            await speakOnce(expected, base);
          } else if (mode === "words") {
            const words = expected.split(/\s+/).filter(Boolean);
            for (const w of words) {
              if (token !== speakTokenRef.current) return;
              await speakOnce(w, { ...base, rate: clamp(rate - 0.1, 0.5, 1.4) });
              await wait(100, token);
            }
          } else {
            await speakOnce(expected, base);
          }
          await wait(120, token);
        }
        if (!loop || token !== speakTokenRef.current) break; // loop guard
      } while (true);
    } finally {
      if (token === speakTokenRef.current) setSpeaking(false);
    }
  }

  // ====== Recording ======
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
    } catch {
      alert("Microphone not available.");
    }
  }
  function stopRecording() {
    try {
      recorderRef.current && recorderRef.current.stop();
    } catch {}
    setRecording(false);
  }

  // ====== STT ======
  function sttOnce() {
    if (!supportsSTT) return;
    const rec = new Recognition();
    try {
      rec.lang = "en-US";
    } catch {}
    rec.interimResults = false;
    try {
      rec.maxAlternatives = 1;
    } catch {}
    rec.onresult = (ev) => {
      const text = ev?.results?.[0]?.[0]?.transcript || "";
      setRecognized(text);
      scoreInput(text);
    };
    rec.onerror = () => {};
    rec.start();
  }

  // ====== Helpers to write Settings ======
  const setTTS = (patch) => setStore?.((s) => ({ ...s, tts: { ...(s.tts || {}), ...patch } }));
  const enVoices = (voices || []).filter((v) => /^en(-|_|$)/i.test(v.lang || ""));

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold">Listening & Speaking Lab</div>
        <div className="text-xs text-slate-400">Google-like voices · Piper option · modes & loop</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          {/* Source */}
          <div className="mb-2 text-sm">Source</div>
          <div className="flex gap-2 mb-3">
            <button
              className={classNames("px-3 py-2 rounded", source === "deck" ? "bg-emerald-500/30" : "bg-white/10 hover:bg-white/20")}
              onClick={() => setSource("deck")}
            >
              From deck
            </button>
            <button
              className={classNames("px-3 py-2 rounded", source === "custom" ? "bg-emerald-500/30" : "bg-white/10 hover:bg-white/20")}
              onClick={() => setSource("custom")}
            >
              Custom
            </button>
          </div>

          {source === "deck" ? (
            <div className="flex flex-col gap-2">
              <label className="text-sm">Choose word</label>
              <select
                className="rounded p-2 bg-white text-black"
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(Number(e.target.value))}
              >
                {store.deck.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.en} — {d.th}
                  </option>
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
                onChange={(e) => setCustomText(e.target.value)}
              />
            </div>
          )}

          {/* TTS controls (system) */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-sm mb-1">Voice (system EN)</div>
              <select
                className="w-full rounded p-2 bg-white text-black"
                value={store.tts?.enVoice || ""}
                onChange={(e) => setTTS({ enVoice: e.target.value })}
              >
                {enVoices.length ? (
                  enVoices.map((v) => (
                    <option key={voiceToKey(v)} value={voiceToKey(v)}>
                      {v.name} — {v.lang}
                    </option>
                  ))
                ) : (
                  <option>(voices loading… tap Play once)</option>
                )}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-sm mb-1">Rate</div>
                <input
                  type="range"
                  min="0.5"
                  max="1.4"
                  step="0.05"
                  value={rate}
                  onChange={(e) => setTTS({ rate: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <div className="text-xs text-slate-300">{rate.toFixed(2)}x</div>
              </div>
              <div>
                <div className="text-sm mb-1">Pitch</div>
                <input
                  type="range"
                  min="0.8"
                  max="1.2"
                  step="0.02"
                  value={pitch}
                  onChange={(e) => setTTS({ pitch: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <div className="text-xs text-slate-300">{pitch.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm mb-1">Volume</div>
                <input
                  type="range"
                  min="0.5"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(e) => setTTS({ volume: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <div className="text-xs text-slate-300">{Math.round(volume * 100)}%</div>
              </div>
            </div>
          </div>

          {/* Piper controls */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={usePiper}
                onChange={(e) => setUsePiper(e.target.checked)}
              />
              Use Piper voice (consistent across devices)
            </label>
            <select
              className="rounded p-2 bg-white text-black"
              value={piperVoice}
              disabled={!usePiper}
              onChange={(e) => setPiperVoice(e.target.value)}
            >
              <option value="en_US-hfc_female-medium">en_US-hfc_female-medium</option>
              {/* Later: populate from listVoices() */}
            </select>
            {usePiper && !piperReady && (
              <span className="text-xs text-slate-300">Downloading… {piperPct}%</span>
            )}
            {usePiper && piperReady && <span className="text-xs text-emerald-300">Ready</span>}
          </div>

          {/* Modes (system TTS only) */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-sm mb-1">Playback mode</div>
              <div className="flex flex-wrap gap-2">
                {[
                  ["normal", "Normal"],
                  ["slow", "Slow"],
                  ["clarity", "Clarity (slow → normal)"],
                  ["words", "Word-by-word"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={classNames(
                      "px-3 py-2 rounded",
                      mode === id ? "bg-emerald-500/30" : "bg-white/10 hover:bg-white/20"
                    )}
                    onClick={() => setMode(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:flex sm:items-end sm:justify-end">
              <div className="flex gap-3 items-center w-full sm:w-auto mt-3 sm:mt-0">
                <label className="flex items-center gap-2">
                  Repeat:
                  <select
                    value={repeat}
                    onChange={(e) => setRepeat(parseInt(e.target.value))}
                    className="rounded p-1 bg-white text-black"
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}×
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
                  Loop
                </label>
              </div>
            </div>
          </div>

          {/* Playback buttons */}
          <div className="mt-4 flex flex-wrap gap-2">
            {/* System TTS with modes */}
            <button
              onClick={speakWithMode}
              disabled={!expected || speaking}
              className={classNames(
                "inline-flex items-center gap-2 rounded bg-white/10 px-3 py-2",
                !expected || speaking ? "opacity-60 cursor-not-allowed" : "hover:bg-white/20"
              )}
            >
              <Volume2 className="size-4" /> {speaking ? "Speaking…" : "Play"}
            </button>

            {/* Stop both engines */}
            <button
              onClick={stopSpeech}
              className="inline-flex items-center gap-2 rounded bg-rose-500/20 px-3 py-2 hover:bg-rose-500/30"
            >
              <Square className="size-4" /> Stop
            </button>

            {/* Piper play/stop */}
            <button
              onClick={() => piperSpeak(expected, { voiceId: piperVoice })}
              disabled={!usePiper || !expected || !piperReady}
              className={classNames(
                "inline-flex items-center gap-2 rounded bg-white/10 px-3 py-2",
                !usePiper || !expected || !piperReady ? "opacity-60 cursor-not-allowed" : "hover:bg-white/20"
              )}
            >
              <Volume2 className="size-4" /> Play (Piper)
            </button>
            <button
              onClick={() => piperStop()}
              disabled={!usePiper}
              className="inline-flex items-center gap-2 rounded bg-rose-500/20 px-3 py-2 hover:bg-rose-500/30"
            >
              <Square className="size-4" /> Stop (Piper)
            </button>

            {/* Recording */}
            {!recording ? (
              <button
                onClick={startRecording}
                className="inline-flex items-center gap-2 rounded bg-emerald-500/20 px-3 py-2 hover:bg-emerald-500/30"
              >
                <Mic className="size-4" /> Record
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="inline-flex items-center gap-2 rounded bg-rose-500/20 px-3 py-2 hover:bg-rose-500/30"
              >
                <Square className="size-4" /> Stop
              </button>
            )}

            {/* Local playback of recorded audio */}
            <button
              onClick={() => {
                if (audioRef.current && audioURL) {
                  audioRef.current.currentTime = 0;
                  audioRef.current.play();
                }
              }}
              disabled={!audioURL}
              className={classNames(
                "inline-flex items-center gap-2 rounded px-3 py-2",
                audioURL ? "bg-white/10 hover:bg-white/20" : "bg-white/5 cursor-not-allowed"
              )}
            >
              <Play className="size-4" /> Playback
            </button>

            {/* STT */}
            <button
              onClick={sttOnce}
              disabled={!supportsSTT}
              className={classNames(
                "inline-flex items-center gap-2 rounded px-3 py-2",
                supportsSTT ? "bg-white/10 hover:bg-white/20" : "bg-white/5 cursor-not-allowed"
              )}
            >
              STT (English)
            </button>
          </div>

          <audio ref={audioRef} src={audioURL ?? undefined} className="hidden" controls />

          {/* Score / target */}
          <div className="mt-4">
            <div className="text-sm text-slate-400 mb-1">Recognized text (or type your attempt)</div>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded p-2 bg-white text-black placeholder-slate-500"
                value={recognized}
                onChange={(e) => setRecognized(e.target.value)}
                placeholder="If STT is unavailable, type what you heard"
              />
              <button onClick={() => scoreInput(recognized)} className="rounded bg-emerald-500 px-4 py-2 hover:bg-emerald-600">
                Check
              </button>
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

        {/* Tips */}
        <div>
          <Card>
            <div className="text-sm text-slate-400">Tips for clarity</div>
            <ul className="mt-2 text-sm list-disc pl-5 space-y-1 text-slate-300">
              <li>Choose a <b>Google*</b> English voice for the most familiar sound.</li>
              <li>Use <b>Slow</b> or <b>Clarity</b> mode to hear it clearly, then normally.</li>
              <li><b>Word-by-word</b> mode helps you hear each word distinctly.</li>
              <li>Enable <b>Piper</b> for the same voice on every device.</li>
            </ul>
          </Card>
        </div>
      </div>
    </Card>
  );
}
