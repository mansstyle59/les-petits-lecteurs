"""Découpe un son de consonne au milieu d'un « a-C-a » repéré par la reconnaissance phonétique,
l'allonge un peu (même hauteur de voix) et revérifie. Garde le fichier exact validé."""
import json, itertools, pathlib, subprocess, tempfile, wave, sys, numpy as np, torch
from piper import PiperVoice
from piper.config import SynthesisConfig
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import phonemes_check as pc
from choisir_sons import ok
R = pathlib.Path(__file__).resolve().parent.parent
v = PiperVoice.load("/tmp/voices/fr_FR-siwis-medium.onnx")
SR = v.config.sample_rate
def wav_tmp(a, sr=SR):
    t = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    with wave.open(t.name, "wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(a, -1, 1) * 32767).astype("<i2").tobytes())
    return t.name
def ff(src, af, rate=16000, fmt="s16le"):
    return subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-af", af, "-f", fmt, "-ac", "1", "-ar", str(rate), "-"], capture_output=True).stdout
def to16k(a): return np.frombuffer(ff(wav_tmp(a), "anull"), np.int16).astype(np.float32) / 32768
def frames(x):
    inp = pc._proc(x, sampling_rate=16000, return_tensors="pt")
    with torch.no_grad(): ids = torch.argmax(pc._model(inp.input_values).logits, dim=-1)[0].tolist()
    return [pc._proc.tokenizer.convert_ids_to_tokens(i) for i in ids]
JOBS = {  # lettre : (sources, symboles reconnus pour la consonne, garder la voyelle après ?, étirement)
    "m": (["ˈama", "amˈa", "ˈɔma"], {"m"}, False, 0.55),
    "r": (["ˈaʁa", "aʁˈa", "ˈɔʁa"], {"ʁ", "r", "ʀ", "ɹ"}, False, 0.55),
    "g": (["aɡˈə", "aɡˈœ", "aɡˈø", "ɔɡˈə"], {"ɡ", "g"}, True, 1.0),
    "u": (["tˈy", "pˈy", "ʁˈy", "lˈyː"], {"y", "ʉ"}, None, 0.8),
}
out = {}
for L in sys.argv[1:] or list(JOBS):
    srcs, cons, keep_after, stretch = JOBS[L]; found = None
    for ph, ls, ns in itertools.product(srcs, (1.0, 1.3, 1.6), (0.3, 0.5)):
        a = np.clip(v.phoneme_ids_to_audio(v.phonemes_to_ids(list(ph)), SynthesisConfig(length_scale=ls, noise_scale=ns, noise_w_scale=0.6)), -1, 1)
        fr = frames(to16k(a)); spikes = [(i, t) for i, t in enumerate(fr) if t not in ("<pad>", "|", "ʔ")]
        k = [j for j, (i, t) in enumerate(spikes) if t in cons]
        if not k: continue
        j = k[0]; ci = spikes[j][0]
        prev = spikes[j - 1][0] if j > 0 else max(0, ci - 6)
        if keep_after is None:   # voyelle u : on garde à partir du symbole
            start = (prev + ci) / 2 if j > 0 else ci - 2; end = len(fr)
            nxt = None
        else:
            nxt = spikes[j + 1][0] if j + 1 < len(spikes) else len(fr)
            start = (prev + ci) / 2
            end = len(fr) if keep_after else (ci + nxt) / 2
        if L == "u":
            start = ci - 1.5; end = len(fr)
        t0, t1 = start * 0.02, min(len(a) / SR, end * 0.02 + 0.02)
        seg = a[int(t0 * SR):int(t1 * SR)].copy()
        if len(seg) < SR * 0.04: continue
        f = min(int(SR * 0.012), len(seg) // 4); seg[:f] *= np.linspace(0, 1, f); seg[-f:] *= np.linspace(1, 0, f)
        src = wav_tmp(seg)
        stretched = np.frombuffer(ff(src, f"atempo={stretch},adelay=200,apad=pad_dur=0.3"), np.int16).astype(np.float32) / 32768
        got = pc.phonemes_of_array(stretched)
        if ok(L, got):
            found = {"source": ph, "ls": ls, "entendu": got}
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-af", f"atempo={stretch},adelay=80,apad=pad_dur=0.15,loudnorm=I=-16:TP=-1.5",
                            "-ac", "1", "-ar", "24000", "-b:a", "48k", str(R / "audio" / "lettres" / f"son-{L}.mp3")], check=True)
            break
    out[L] = found; print(L, "->", found or "ÉCHEC", flush=True)
