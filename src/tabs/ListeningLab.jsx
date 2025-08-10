import React, { useMemo, useRef, useState } from "react";
import { Volume2, Mic, Square, Play } from "lucide-react";

const classNames = (...a) => a.filter(Boolean).join(" ");

export default function ListeningLab({ store, onXP, speak }) {
  const [source, setSource] = useState("deck");
  const [selectedId, setSelectedId] = useState(store.deck[0]?.id ?? null);
  const [customText, setCustomText] = useState("");
  const [recognized, setRecognized] = useState("");
  const [scorePct, setScorePct] = useState(null);
  const audioRef = useRef(null);

  const [recording, setRecording] = useState(false);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [audioURL, setAudioURL] = useState(null);

  const Recognition = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const supportsSTT = !!Recognition;

  const expected = useMemo(() => {
    if (source === "custom") return customText.trim();
    const card = store.deck.find((d) => d.id === selectedId);
    return card?.en ?? "";
  }, [source, customText, store.deck, selectedId]);

  function normalize(s){ return s.toLowerCase().replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim(); }
  function levenshtein(a,b){
    const m=a.length,n=b.length; const dp=Array.from({length:m+1},()=>Array(n+1).fill(0));
    for(let i=0;i<=m;i++) dp[i][0]=i; for(let j=0;j<=n;j++) dp[0][j]=j;
    for(let i=1;i<=m;i++){ for(let j=1;j<=n;j++){ const cost=a[i-1]===b[j-1]?0:1; dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+cost); } }
    return dp[m][n];
  }
  function scoreInput(input){
    const A=normalize(expected), B=normalize(input||"");
    if(!A||!B){ setScorePct(null); return; }
    const dist=levenshtein(A,B); const denom=Math.max(A.length,B.length)||1;
    const pct=Math.max(0, Math.round((1 - dist/denom)*100)); setScorePct(pct);
    onXP(pct>=85?12:5);
  }

  async function startRecording(){
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e)=> e.data && e.data.size && chunksRef.current.push(e.data);
      rec.onstop = ()=>{
        const blob = new Blob(chunksRef.current, { type:"audio/webm" });
        const url = URL.createObjectURL(blob); setAudioURL(url);
        stream.getTracks().forEach((t)=>t.stop());
      };
      rec.start(); setRecording(true);
    }catch(e){ alert("Microphone not available."); }
  }
  function stopRecording(){ try{ recorderRef.current && recorderRef.current.stop(); }catch{} setRecording(false); }
  function sttOnce(){
    if(!supportsSTT) return;
    const rec = new Recognition();
    try{ rec.lang="en-US"; }catch{}
    rec.interimResults=false; try{ rec.maxAlternatives=1; }catch{}
    rec.onresult=(ev)=>{ const text=ev?.results?.[0]?.[0]?.transcript||""; setRecognized(text); scoreInput(text); };
    rec.onerror=()=>{}; rec.start();
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold">Listening & Speaking Lab</div>
        <div className="text-xs text-slate-400">TTS playback · mic recording · optional STT</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="mb-2 text-sm">Source</div>
          <div className="flex gap-2 mb-3">
            <button className={classNames("px-3 py-2 rounded", source==="deck"?"bg-emerald-500/30":"bg-white/10 hover:bg-white/20")} onClick={()=>setSource("deck")}>From deck</button>
            <button className={classNames("px-3 py-2 rounded", source==="custom"?"bg-emerald-500/30":"bg-white/10 hover:bg-white/20")} onClick={()=>setSource("custom")}>Custom</button>
          </div>

          {source==="deck" ? (
            <div className="flex flex-col gap-2">
              <label className="text-sm">Choose word</label>
              <select className="rounded p-2 bg-white text-black" value={selectedId ?? ""} onChange={(e)=>setSelectedId(Number(e.target.value))}>
                {store.deck.map((d)=> (<option key={d.id} value={d.id}>{d.en} — {d.th}</option>))}
              </select>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="text-sm">Custom English text</label>
              <textarea className="rounded p-2 bg-white text-black placeholder-slate-500" rows={3} placeholder="Type a sentence to practice" value={customText} onChange={(e)=>setCustomText(e.target.value)} />
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={()=> speak(expected || "", "en-US")} className="inline-flex items-center gap-2 rounded bg-white/10 px-3 py-2 hover:bg-white/20">
              <Volume2 className="size-4" /> Play TTS
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

            <button onClick={()=> sttOnce()} disabled={!supportsSTT} className={classNames("inline-flex items-center gap-2 rounded px-3 py-2", supportsSTT ? "bg-white/10 hover:bg-white/20" : "bg-white/5 cursor-not-allowed")}>
              STT (English)
            </button>
          </div>

          <audio ref={audioRef} src={audioURL ?? undefined} className="hidden" controls />
          <div className="mt-4">
            <div className="text-sm text-slate-400 mb-1">Recognized text (or type your attempt)</div>
            <div className="flex gap-2">
              <input className="flex-1 rounded p-2 bg-white text-black placeholder-slate-500" value={recognized} onChange={(e)=>setRecognized(e.target.value)} placeholder="If STT is unavailable, type what you heard" />
              <button onClick={()=> scoreInput(recognized)} className="rounded bg-emerald-500 px-4 py-2 hover:bg-emerald-600">Check</button>
            </div>
            <div className="text-sm text-slate-300 mt-2">Target: <i>{expected || "(empty)"}</i></div>
            {scorePct !== null && <div className="mt-2 text-sm">Similarity: <b>{scorePct}%</b> {scorePct >= 85 ? "✅ Great!" : "✨ Keep practicing"}</div>}
          </div>
        </div>

        <div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm text-slate-400">Tips</div>
            <ul className="mt-2 text-sm list-disc pl-5 space-y-1 text-slate-300">
              <li>Click <b>Play TTS</b> to hear the sentence.</li>
              <li>Use <b>Record</b> to capture your voice, then <b>Playback</b>.</li>
              <li>If your browser supports it, use <b>STT</b> to transcribe what you say.</li>
              <li>Hit <b>Check</b> to score your attempt and earn XP.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
