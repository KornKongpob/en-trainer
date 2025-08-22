// src/tabs/ListeningLab.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, Mic, Square, Play } from "lucide-react";

const classNames = (...a) => a.filter(Boolean).join(" ");
function Card({ children }) { return <div className="rounded-3xl border border-white/10 bg-white/5 p-4">{children}</div>; }

export default function ListeningLab({ store, onXP }) {
  // ----- Source of text -----
  const [source, setSource] = useState("deck");
  const firstId = store.deck[0]?.id ?? null;
  const [selectedId, setSelectedId] = useState(firstId);
  const [customText, setCustomText] = useState("");

  // ----- Scoring / STT -----
  const [recognized, setRecognized] = useState("");
  const [scorePct, setScorePct] = useState(null);

  // ----- Recording -----
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [audioURL, setAudioURL] = useState(null);
  const audioRef = useRef(null);

  // ----- Voices / TTS controls -----
  const [voices, setVoices] = useState([]);
  const [voiceKey, setVoiceKey] = useState(""); // string key
  const [rate, setRate] = useState(1.0);   // closer to Google Translate feel
  const [pitch, setPitch] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [mode, setMode] = useState("normal"); // normal | slow | clarity | words
  const [repeat, setRepeat] = useState(1);
  const [loop, setLoop] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  // ----- STT support -----
  const Recognition =
    typeof window !== "undefined"
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;
  const supportsSTT = !!Recognition;

  // ----- Expected text -----
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
    if (pct >= 85) onXP?.(12); else onXP?.(5);
  }

  // ====== Voices: load & choose (prefer Google voices) ======
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const voiceToKey = (v) => `${v.name}__${v.lang}`;
    const pickDefault = (list) => {
      const en = list.filter(v => /^en(-|_|$)/i.test(v.lang));
      const scoreVoice = (v) => {
        const name = (v.name || "").toLowerCase();
        const lang = (v.lang || "").toLowerCase();
        let s = 0;
        // Strongly prefer Chrome "Google ..." voices (closest to Google Translate)
        if (name.includes("google")) s += 10;
        // Then other popular high-quality voices
        if (name.includes("enhanced")) s += 3;
        if (name.includes("samantha") || name.includes("karen") || name.includes("daniel")) s += 2;
        // Locale preference
        if (/en-us/.test(lang)) s += 3;
        if (/en-gb|en-au|en-in/.test(lang)) s += 1;
        return s;
      };
      const pool = en.length ? en : list;
      const best = pool.slice().sort((a,b)=>scoreVoice(b)-scoreVoice(a))[0];
      return best || list[0];
    };

    const updateList = () => {
      const list = window.speechSynthesis.getVoices();
      if (!list || !list.length) return;
      setVoices(list);
      setVoiceKey((prev) => {
        if (prev) return prev;
        const def = pickDefault(list);
        return def ? voiceToKey(def) : "";
      });
    };

    updateList();
    window.speechSynthesis.onvoiceschanged = updateList;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const currentVoice = useMemo(() => {
    return voices.find(v => `${v.name}__${v.lang}` === voiceKey);
  }, [voices, voiceKey]);

  // ====== TTS engine ======
  const stopSpeech = () => {
    try { window.speechSynthesis.cancel(); } catch {}
    setSpeaking(false);
  };

  async function speakOnce(text, { rate, pitch, volume, voice }) {
    return new Promise((resolve) => {
      try {
        const u = new SpeechSynthesisUtterance(text);
        if (voice) u.voice = voice;
        u.rate = rate;
        u.pitch = pitch;
        u.volume = volume;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
      } catch {
        resolve();
      }
    });
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function speakWithMode() {
    if (!expected) return;
    stopSpeech();
    setSpeaking(true);

    const base = { rate, pitch, volume, voice: currentVoice };
    const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

    try {
      for (let round = 0; round < repeat || 1; round++) {
        if (mode === "slow") {
          await speakOnce(expected, { ...base, rate: clamp(rate - 0.2, 0.5, 1.4) });
        } else if (mode === "clarity") {
          await speakOnce(expected, { ...base, rate: clamp(rate - 0.2, 0.5, 1.4) });
          await wait(200);
          await speakOnce(expected, base);
        } else if (mode === "words") {
          const words = expected.split(/\s+/).filter(Boolean);
          for (const w of words) {
            await speakOnce(w, { ...base, rate: clamp(rate - 0.1, 0.5, 1.4) });
            await wait(120);
          }
        } else {
          await speakOnce(expected, base);
        }
        await wait(120);
      }
    } finally {
      setSpeaking(false);
      if (loop) { speakWithMode(); } // loop if toggled
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
    try { recorderRef.current && recorderRef.current.stop(); } catch {}
    setRecording(false);
  }

  // ====== STT ======
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

  const voiceToKey = (v) => `${v.name}__${v.lang}`;

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold">Listening & Speaking Lab</div>
        <div className="text-xs text-slate-400">Google-like voice · clarity modes · loop & repeat</div>
      </div>

      {/* Source */}
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
                {store.deck.map((d)=>(<option key={d.id} value={d.id}>{d.en} — {d.th}</option>))}
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

          {/* TTS controls */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-sm mb-1">Voice</div>
              <select
                className="w-full rounded p-2 bg-white text-black"
                value={voiceKey}
                onChange={(e)=>setVoiceKey(e.target.value)}
              >
                {voices
                  .filter(v => /^en(-|_|$)/i.test(v.lang))
                  .map(v => <option key={voiceToKey(v)} value={voiceToKey(v)}>{v.name} — {v.lang}</option>)}
                {!voices.length && <option>(voices loading… tap Play once)</option>}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-sm mb-1">Rate</div>
                <input type="range" min="0.5" max="1.4" step="0.05" value={rate} onChange={(e)=>setRate(parseFloat(e.target.value))} className="w-full" />
                <div className="text-xs text-slate-300">{rate.toFixed(2)}x</div>
              </div>
              <div>
                <div className="text-sm mb-1">Pitch</div>
                <input type="range" min="0.8" max="1.2" step="0.02" value={pitch} onChange={(e)=>setPitch(parseFloat(e.target.value))} className="w-full" />
                <div className="text-xs text-slate-300">{pitch.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm mb-1">Volume</div>
                <input type="range" min="0.5" max="1" step="0.05" value={volume} onChange={(e)=>setVolume(parseFloat(e.target.value))} className="w-full" />
                <div className="text-xs text-slate-300">{Math.round(volume*100)}%</div>
              </div>
            </div>
          </div>

          {/* Modes */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-sm mb-1">Playback mode</div>
              <div className="flex flex-wrap gap-2">
                {[
                  ["normal","Normal"],
                  ["slow","Slow"],
                  ["clarity","Clarity (slow → normal)"],
                  ["words","Word-by-word"],
                ].map(([id,label])=>(
                  <button key={id}
                    className={classNames("px-3 py-2 rounded", mode===id ? "bg-emerald-500/30":"bg-white/10 hover:bg-white/20")}
                    onClick={()=>setMode(id)}
                  >{label}</button>
                ))}
              </div>
            </div>
            <div className="sm:flex sm:items-end sm:justify-end">
              <div className="flex gap-3 items-center w-full sm:w-auto mt-3 sm:mt-0">
                <label className="flex items-center gap-2">
                  Repeat:
                  <select value={repeat} onChange={(e)=>setRepeat(parseInt(e.target.value))}
                          className="rounded p-1 bg-white text-black">
                    {[1,2,3,4].map(n=> <option key={n} value={n}>{n}×</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={loop} onChange={(e)=>setLoop(e.target.checked)} />
                  Loop
                </label>
              </div>
            </div>
          </div>

          {/* Playback buttons */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={speakWithMode} disabled={!expected || speaking}
                    className={classNames("inline-flex items-center gap-2 rounded bg-white/10 px-3 py-2",
                      (!expected || speaking) ? "opacity-60 cursor-not-allowed":"hover:bg-white/20")}>
              <Volume2 className="size-4" /> {speaking ? "Speaking…" : "Play"}
            </button>
            <button onClick={stopSpeech} className="inline-flex items-center gap-2 rounded bg-rose-500/20 px-3 py-2 hover:bg-rose-500/30">
              <Square className="size-4" /> Stop
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

            <button onClick={sttOnce} disabled={!supportsSTT}
              className={classNames("inline-flex items-center gap-2 rounded px-3 py-2",
                supportsSTT ? "bg-white/10 hover:bg-white/20" : "bg-white/5 cursor-not-allowed")}>
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

        {/* Tips */}
        <div>
          <Card>
            <div className="text-sm text-slate-400">Tips for clarity</div>
            <ul className="mt-2 text-sm list-disc pl-5 space-y-1 text-slate-300">
              <li>Prefer a <b>Google</b> voice (e.g., “Google US English”) when available.</li>
              <li>Use <b>Slow</b> or <b>Clarity</b> mode to hear it clearly, then normally.</li>
              <li><b>Word-by-word</b> mode helps you hear each word distinctly.</li>
              <li>Repeat or enable <b>Loop</b> for shadowing practice.</li>
            </ul>
          </Card>
        </div>
      </div>
    </Card>
  );
}
