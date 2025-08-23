// src/tts/piperClient.js
import * as tts from '@mintplex-labs/piper-tts-web';

let currentAudio = null;

export async function downloadVoice(voiceId = 'en_US-hfc_female-medium', onProgress) {
  // onProgress gets a number 0..1
  return tts.download(voiceId, onProgress);
}

export async function speak(text, { voiceId = 'en_US-hfc_female-medium' } = {}) {
  if (!text) return;
  const wav = await tts.predict({ text, voiceId });
  if (currentAudio) {
    try { currentAudio.pause(); } catch {}
    try { URL.revokeObjectURL(currentAudio.src); } catch {}
  }
  const url = URL.createObjectURL(wav);
  const audio = new Audio(url);
  currentAudio = audio;
  await audio.play();
  return new Promise((resolve) => {
    audio.onended = () => {
      try { URL.revokeObjectURL(url); } catch {}
      resolve();
    };
  });
}

export function stop() {
  if (currentAudio) {
    try { currentAudio.pause(); } catch {}
    try { currentAudio.currentTime = 0; } catch {}
  }
}

export async function listVoices() {
  try { return await tts.voices(); } catch { return []; }
}
