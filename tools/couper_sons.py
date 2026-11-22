"""Pour les sons que le moteur ne sait pas dire seuls : on fait dire « a + son », on repère
le son avec la reconnaissance phonétique (au centième de seconde) et on le découpe.
Chaque découpe est revérifiée. Sortie : audio/lettres/son-x.mp3 + tools/sons_decoupes.json."""
import json, itertools, pathlib, subprocess, tempfile, wave, sys, numpy as np, torch
from piper import PiperVoice
from piper.config import SynthesisConfig
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import phonemes_check as pc
from choisir_sons import ok, TARGET
R = pathlib.Path(__file__).resolve().parent.parent
v = PiperVoice.load("/tmp/voices/fr_FR-siwis-medium.onnx")
SR = v.config.sample_rate
def to16k(a):
    with tempfile.NamedTemporaryFile(suffix=".wav") as t:
        with wave.open(t.name, "wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((a * 32767).astype("<i2").tobytes())
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", t.name, "-f", "s16le", "-ac", "1", "-ar", "16000", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768
def frames(x):
    inp = pc._proc(x, sampling_rate=16000, return_tensors="pt")
    with torch.no_grad(): ids = torch.argmax(pc._model(inp.input_values).logits, dim=-1)[0].tolist()
    return [pc._proc.tokenizer.convert_ids_to_tokens(i) for i in ids]  # 1 trame = 20 ms
def pad(a, before=0.2, after=0.3): return np.concatenate([np.zeros(int(SR * before)), a, np.zeros(int(SR * after))])
SRC = {"m": ["ˈamːː", "ˈamːːː", "ˈammm"], "l": ["ˈalːː", "ˈalːːː"], "r": ["ˈaʁːː", "ˈaʁːːː"], "z": ["ˈazːː", "ˈazːːː"],
       "j": ["ˈaʒːː", "ˈaʒːːː"], "w": ["ˈavːː", "ˈavːːː"], "g": ["aɡˈə", "aɡə", "aɡˈø"], "x": ["ˈaks", "ˈaksː"], "u": ["lˈy", "lˈyː", "ʒˈy"]}
KEEP = {"m": {"m"}, "l": {"l"}, "r": {"ʁ", "r", "ʀ", "ɹ"}, "z": {"z"}, "j": {"ʒ"}, "w": {"v"}, "g": {"ɡ", "g", "ə", "ø", "əɜ", "œ"},
        "x": {"k", "s"}, "u": {"y", "ʉ"}}
START = {"g": {"ɡ", "g"}, "x": {"k"}}
res = {}
for L in sys.argv[1:] or list(SRC):
    found = None
    for ph, ls in itertools.product(SRC[L], (1.0, 1.3, 1.6)):
        a = np.clip(v.phoneme_ids_to_audio(v.phonemes_to_ids(list(ph)), SynthesisConfig(length_scale=ls, noise_scale=0.4, noise_w_scale=0.6)), -1, 1)
        fr = frames(to16k(a))
        start_set = START.get(L, KEEP[L])
        idx = [i for i, t in enumerate(fr) if t in start_set]
        if not idx: continue
        s0 = idx[0]
        e0 = s0
        for i in range(s0, len(fr)):
            if fr[i] in KEEP[L] or fr[i] in ("<pad>", "|"): e0 = i if fr[i] in KEEP[L] else e0
            else: break
        t0 = max(0, s0 * 0.02 - 0.03); t1 = min(len(a) / SR, (e0 + 1) * 0.02 + 0.06)
        seg = a[int(t0 * SR):int(t1 * SR)].copy()
        if len(seg) < SR * 0.08: continue
        f = int(SR * 0.012); seg[:f] *= np.linspace(0, 1, f); seg[-f:] *= np.linspace(1, 0, f)
        got = pc.phonemes_of_array(to16k(pad(seg)))
        if ok(L, got):
            found = {"source": ph, "ls": ls, "debut": round(t0, 3), "fin": round(t1, 3), "entendu": got}
            out = R / "audio" / "lettres" / f"son-{L}.mp3"
            with tempfile.NamedTemporaryFile(suffix=".wav") as t:
                with wave.open(t.name, "wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((pad(seg, 0.08, 0.15) * 32767).astype("<i2").tobytes())
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", t.name, "-af", "loudnorm=I=-16:TP=-1.5", "-ac", "1", "-ar", "24000", "-b:a", "48k", str(out)], check=True)
            break
    res[L] = found
    print(L, "->", found or "ÉCHEC", flush=True)
p = R / "tools" / "sons_decoupes.json"
old = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
old.update({k: v for k, v in res.items() if v}); p.write_text(json.dumps(old, ensure_ascii=False, indent=1), encoding="utf-8")
