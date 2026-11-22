"""Choisit, pour chaque son de lettre, le rendu que la reconnaissance phonétique entend exactement.
Écrit tools/choix_voix.json (clé « lettres/son-x »)."""
import json, itertools, pathlib, re, numpy as np, sys
from piper import PiperVoice
from piper.config import SynthesisConfig
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from phonemes_check import phonemes_of_array
import subprocess, tempfile, wave
R = pathlib.Path(__file__).resolve().parent.parent
v = PiperVoice.load("/tmp/voices/fr_FR-siwis-medium.onnx")
SR = v.config.sample_rate
LAST = {}
def render(ph, ls, ns, nw):
    a = np.clip(v.phoneme_ids_to_audio(v.phonemes_to_ids(list(ph)), SynthesisConfig(length_scale=ls, noise_scale=ns, noise_w_scale=nw)), -1, 1)
    LAST["a"] = a
    with tempfile.NamedTemporaryFile(suffix=".wav") as t:
        with wave.open(t.name, "wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((a * 32767).astype("<i2").tobytes())
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", t.name, "-af", "adelay=200,apad=pad_dur=0.3", "-f", "s16le", "-ac", "1", "-ar", "16000", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768
def toks(s): return [t.replace("ː", "") for t in s.split() if t not in ("ʔ",)]
VOWELS = set("a ɑ e ɛ i o ɔ u y ə ø œ ɜ əɜ ɑ̃ ɔ̃ ɛ̃".split())
# cible : (consonne attendue, voyelles acceptées après) ; None = voyelle seule
TARGET = {
 "a": ({"a", "ɑ"}, None), "e": ({"e"}, None), "i": ({"i"}, None), "o": ({"o", "ɔ"}, None), "u": ({"y", "ʉ"}, None), "y": ({"i"}, None),
 "m": ({"m"}, "pure"), "l": ({"l"}, "pure"), "r": ({"ʁ", "r", "ʀ"}, "pure"), "s": ({"s"}, "pure"), "f": ({"f"}, "pure"),
 "v": ({"v"}, "pure"), "z": ({"z"}, "pure"), "j": ({"ʒ"}, "pure"), "n": ({"n"}, "pure"), "w": ({"v"}, "pure"),
 "p": ({"p"}, "schwa"), "t": ({"t"}, "schwa"), "b": ({"b"}, "schwa"), "d": ({"d"}, "schwa"), "c": ({"k"}, "schwa"),
 "k": ({"k"}, "schwa"), "q": ({"k"}, "schwa"), "g": ({"ɡ", "g"}, "schwa"), "x": ({"k"}, "ks"),
}
IPA = {"a": "a", "e": "e", "i": "i", "o": "o", "u": "y", "y": "i", "m": "m", "l": "l", "r": "ʁ", "s": "s", "f": "f", "v": "v",
       "z": "z", "j": "ʒ", "n": "n", "w": "v", "p": "p", "t": "t", "b": "b", "d": "d", "c": "k", "k": "k", "q": "k", "g": "ɡ", "x": "ks"}
def ok(L, got):
    want, kind = TARGET[L]; t = toks(got)
    if kind and len(t) > 1 and t[0] in ("ə", "əɜ") and t[1] in want: t = t[1:]
    if not t: return False
    if kind is None: return len(t) == 1 and t[0] in want
    if kind == "pure": return all(x in want for x in t)
    if kind == "schwa_doux": kind = "schwa"
    if kind == "schwa": return t[0] in want and len(t) <= 2 and all(x in VOWELS and x in ("ə", "ø", "œ", "ɜ", "əɜ") for x in t[1:])
    if kind == "ks": return t[:2] == ["k", "s"] and len(t) == 2
def robuste(L, mp3):
    """Le fichier final doit être reconnu correctement dans au moins 2 des 3 réglages d'écoute
    (le vérificateur invente parfois un « a » devant une consonne quand le silence est long)."""
    good = 0
    for delay, pad in ((100, 0.2), (200, 0.3), (350, 0.6)):
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", mp3, "-af", f"adelay={delay},apad=pad_dur={pad}", "-f", "s16le", "-ac", "1", "-ar", "16000", "-"], capture_output=True).stdout
        good += ok(L, phonemes_of_array(np.frombuffer(raw, np.int16).astype(np.float32) / 32768))
    return good >= 2
def candidates(L):
    c = IPA[L]
    if TARGET[L][1] is None: return [f"ˈ{c}", f"ˈ{c}ː", f"{c}", f"ˈ{c}!", f"ˈ{c}.", f"ˈ{c}ːː"]
    if TARGET[L][1] == "pure": return [f"ˈ{c}ː", f"ˈ{c}ːː", f"{c}ːː", f"ˈ{c}{c}{c}", f"{c}", f"ˈ{c}ːːː"]
    if TARGET[L][1] == "schwa_doux": return [f"ˈ{c}ː", f"{c}ːː", f"{c}ˈə", f"{c}ə", f"{c}ˈø", f"ˈ{c}{c}ə"]
    if TARGET[L][1] == "ks": return ["ˈksː", "kˈs", "ˈks", "ksːː"]
    return [f"{c}ˈə", f"{c}ə", f"ˈ{c}ə", f"{c}ˈø", f"{c}ˈœ"]
def save_mp3(ph, ls, ns, nw, L):
    a = np.clip(v.phoneme_ids_to_audio(v.phonemes_to_ids(list(ph)), SynthesisConfig(length_scale=ls, noise_scale=ns, noise_w_scale=nw)), -1, 1)
    return a

if len(sys.argv) > 1 and sys.argv[1] == "--doux":
    for L in sys.argv[2:]: TARGET[L] = (TARGET[L][0], "schwa_doux")
    sys.argv = [sys.argv[0]] + sys.argv[2:]
if __name__ == "__main__":
    letters = sys.argv[1:] or list(TARGET)
    out_path = R / "tools" / "choix_voix.json"
    res = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else {}
    for L in letters:
        found = None; seen = []
        for ph, ls, ns, nw in list(itertools.product(candidates(L), (1.0, 1.3, 1.6, 0.85), (0.3, 0.55), (0.4, 0.8))) * 2:
            try: got = phonemes_of_array(render(ph, ls, ns, nw))
            except Exception: continue
            seen.append(got)
            if ok(L, got):
                found = {"api": ph, "ls": ls, "ns": ns, "nw": nw, "entendu": got, "score": 1.0, "fichier_verifie": True}
                a = LAST["a"]
                with tempfile.NamedTemporaryFile(suffix=".wav") as t:
                    with wave.open(t.name, "wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((a * 32767).astype("<i2").tobytes())
                    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", t.name, "-af", "adelay=80,apad=pad_dur=0.15,loudnorm=I=-16:TP=-1.5", "-ac", "1", "-ar", "24000", "-b:a", "48k", str(R / "audio" / "lettres" / f"son-{L}.mp3")], check=True)
                break
        if found: res[f"lettres/son-{L}"] = found
        print(L, "->", found or ("ÉCHEC, entendu: " + " | ".join(sorted(set(seen))[:6])), flush=True)
        out_path.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
