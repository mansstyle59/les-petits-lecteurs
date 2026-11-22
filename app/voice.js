// Reconnaissance vocale sur l'appareil (Whisper via transformers.js) : rien n'est envoyé sur Internet.
// Fonctionne de la même façon dans Safari, sur l'écran d'accueil iPhone, dans l'APK et l'IPA.
import { pipeline, env, AutoProcessor, AutoTokenizer, WhisperForConditionalGeneration, Tensor } from "./vendor/transformers.min.js";

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL("./models/", import.meta.url).href;
env.backends.onnx.wasm.wasmPaths = new URL("./vendor/", import.meta.url).href;
env.backends.onnx.wasm.numThreads = 1;

const MODEL = "whisper-base";
let asrPromise = null;

export function loadASR(onProgress) {
  if (!asrPromise) {
    asrPromise = pipeline("automatic-speech-recognition", globalThis.LPL_ASR_MODEL || MODEL, {
      dtype: "q8",
      device: "wasm",
      progress_callback: onProgress || (() => {})
    }).catch((e) => { asrPromise = null; throw e; });
  }
  return asrPromise;
}

export async function transcribe(audio16k) {
  const asr = await loadASR();
  const out = await asr(audio16k, { language: "french", task: "transcribe", return_timestamps: false });
  return String(out.text || "").trim();
}

// Rééchantillonne vers 16 kHz (format attendu par Whisper)
async function to16k(samples, rate) {
  if (rate === 16000) return samples;
  const len = Math.ceil(samples.length * 16000 / rate);
  const off = new OfflineAudioContext(1, len, 16000);
  const buf = off.createBuffer(1, samples.length, rate);
  buf.copyToChannel(samples, 0);
  const src = off.createBufferSource();
  src.buffer = buf; src.connect(off.destination); src.start();
  const r = await off.startRendering();
  return r.getChannelData(0).slice();
}

export async function decodeFile(url) {
  const ab = await (await fetch(url)).arrayBuffer();
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const b = await ctx.decodeAudioData(ab);
  const data = await to16k(b.getChannelData(0).slice(), b.sampleRate);
  ctx.close();
  return data;
}

let stream = null;
export function releaseMic() {
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
}

// Enregistre jusqu'à ce que l'enfant ait fini de parler (détection du silence).
// Renvoie { audio: Float32Array 16 kHz, speech: true/false, level: 0..1 }
export async function record({ maxMs = 5000, silenceMs = 900, startTimeoutMs = 4000, onLevel, signal } = {}) {
  if (!stream) {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
    });
  }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") await ctx.resume();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(2048, 1, 1);
  const chunks = [];
  let started = false, lastVoice = 0, peak = 0, noise = 0.004, t0 = performance.now();

  return await new Promise((resolve) => {
    let done = false;
    const finish = async () => {
      if (done) return; done = true;
      proc.disconnect(); src.disconnect();
      const rate = ctx.sampleRate;
      let total = 0; chunks.forEach((c) => total += c.length);
      const all = new Float32Array(total); let o = 0;
      chunks.forEach((c) => { all.set(c, o); o += c.length; });
      ctx.close();
      // garde 0,3 s avant la parole et coupe le silence de fin
      const audio = await to16k(all, rate);
      resolve({ audio, speech: started, level: peak });
    };
    if (signal) signal.addEventListener("abort", finish, { once: true });
    proc.onaudioprocess = (e) => {
      const d = e.inputBuffer.getChannelData(0);
      let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i];
      const rms = Math.sqrt(s / d.length);
      const now = performance.now();
      if (!started) noise = noise * 0.9 + rms * 0.1;
      const thr = Math.max(0.012, noise * 3.2);
      if (rms > thr) { if (!started) { started = true; } lastVoice = now; }
      if (rms > peak) peak = rms;
      if (onLevel) onLevel(Math.min(1, rms / 0.15));
      chunks.push(new Float32Array(d));
      if (!started && chunks.length * 2048 / ctx.sampleRate > 0.6) chunks.shift(); // fenêtre glissante avant la parole
      if (started && now - lastVoice > silenceMs) finish();
      else if (now - t0 > maxMs) finish();
      else if (!started && now - t0 > startTimeoutMs) finish();
    };
    src.connect(proc); proc.connect(ctx.destination);
  });
}

// ---------- Choix contraint : quel mot, parmi des candidats, a été dit ? ----------
let parts = null;
let progressCb = null;
const loaded = {};
function onProgress(e) {
  if (e && e.file && e.total) { loaded[e.file] = { l: e.loaded || 0, t: e.total }; }
  let l = 0, t = 0; Object.values(loaded).forEach((x) => { l += x.l; t += x.t; });
  if (progressCb && t) progressCb(Math.min(1, l / t));
}
async function loadParts() {
  if (!parts) {
    const id = globalThis.LPL_ASR_MODEL || MODEL;
    parts = Promise.all([
      AutoProcessor.from_pretrained(id, { progress_callback: onProgress }),
      AutoTokenizer.from_pretrained(id, { progress_callback: onProgress }),
      WhisperForConditionalGeneration.from_pretrained(id, { dtype: "q8", device: "wasm", progress_callback: onProgress })
    ]).then(([processor, tokenizer, model]) => ({ processor, tokenizer, model })).catch((e) => { parts = null; throw e; });
  }
  return parts;
}
export async function warmup(cb) { progressCb = cb || null; await loadParts(); progressCb = null; }

// Transcription libre (phrases entières, ex. inscription) avec le même modèle déjà chargé
export async function transcribeText(audio16k) {
  const { processor, tokenizer, model } = await loadParts();
  const { input_features } = await processor(audio16k);
  const out = await model.generate({ inputs: input_features, language: "fr", task: "transcribe", max_new_tokens: 40 });
  return tokenizer.batch_decode(out, { skip_special_tokens: true })[0].trim();
}

// Lecture de la voix enregistrée (pour que l'enfant se réécoute)
export function playBack(audio16k) {
  return new Promise((resolve) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const b = ctx.createBuffer(1, audio16k.length, 16000);
      b.copyToChannel(audio16k, 0);
      const src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination);
      src.onended = () => { ctx.close(); resolve(); };
      src.start();
    } catch (e) { resolve(); }
  });
}

function logSoftmaxAt(row, idx) {
  let m = -Infinity; for (let i = 0; i < row.length; i++) if (row[i] > m) m = row[i];
  let s = 0; for (let i = 0; i < row.length; i++) s += Math.exp(row[i] - m);
  return row[idx] - m - Math.log(s);
}

// Renvoie, pour chaque candidat, la vraisemblance moyenne par élément (plus haut = plus probable).
// Le son est analysé une seule fois, puis tous les candidats sont évalués en un seul passage.
export async function score(audio16k, candidates) {
  const { processor, tokenizer, model } = await loadParts();
  const { input_features } = await processor(audio16k);
  const encSession = model.sessions.model;
  const encOut = await encSession.run({ input_features: input_features.ort_tensor || input_features });
  const hidden = new Tensor(encOut.last_hidden_state);
  const tok = (t) => tokenizer.model.tokens_to_ids.get(t);
  const prefix = [tok("<|startoftranscript|>"), tok("<|fr|>"), tok("<|transcribe|>"), tok("<|notimestamps|>")];
  const eot = tok("<|endoftext|>");
  const seqs = candidates.map((text) => prefix.concat(tokenizer.encode(" " + text, { add_special_tokens: false }), [eot]));
  const L = Math.max(...seqs.map((q) => q.length)) - 1, N = seqs.length;
  const ids = new BigInt64Array(N * L);
  seqs.forEach((q, n) => { for (let i = 0; i < L; i++) ids[n * L + i] = BigInt(i < q.length - 1 ? q[i] : eot); });
  const [_, T, D] = hidden.dims;
  const rep = new Float32Array(N * T * D);
  for (let n = 0; n < N; n++) rep.set(hidden.data, n * T * D);
  const out = await model({
    encoder_outputs: new Tensor("float32", rep, [N, T, D]),
    decoder_input_ids: new Tensor("int64", ids, [N, L])
  });
  const V = out.logits.dims[2], data = out.logits.data;
  return seqs.map((q, n) => {
    let lp = 0;
    for (let i = prefix.length - 1; i < q.length - 1; i++) {
      const row = data.subarray((n * L + i) * V, (n * L + i + 1) * V);
      lp += logSoftmaxAt(row, q[i + 1]);
    }
    return lp / (q.length - prefix.length);
  });
}
