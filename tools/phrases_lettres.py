"""Une phrase naturelle par lettre, vérifiée automatiquement :
   carte    : « La lettre A fait le son a, comme dans avion. »  -> audio/lettres/phrase-a.mp3
   question : « Écoute le son : a, comme dans avion. »         -> audio/lettres/question-a.mp3
Vérification : Whisper (phrase entière) + reconnaissance française (le son après « son »)."""
import json, sys, re, wave, tempfile, subprocess, unicodedata, pathlib, itertools, numpy as np
from piper import PiperVoice
from piper.config import SynthesisConfig
from faster_whisper import WhisperModel
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from francais_check import text_of, phon
R = pathlib.Path(__file__).resolve().parent.parent
v = PiperVoice.load("/tmp/voices/fr_FR-siwis-medium.onnx"); SR = v.config.sample_rate
W = WhisperModel("small", device="cpu", compute_type="int8")
cours = json.load(open(R / "contenu" / "cours.json", encoding="utf-8"))
EX = {it["lettre_minuscule"]: it["exemple"] for m in cours["modules"] for l in m["lecons"] for it in l["items"] if "lettre_minuscule" in it}
NOM = {"a": "ˈa", "b": "bˈe", "c": "sˈe", "d": "dˈe", "e": "ˈə", "f": "ˈɛf", "g": "ʒˈe", "h": "ˈaʃ", "i": "ˈi", "j": "ʒˈi", "k": "kˈa",
       "l": "ˈɛl", "m": "ˈɛm", "n": "ˈɛn", "o": "ˈo", "p": "pˈe", "q": "kˈy", "r": "ˈɛʁ", "s": "ˈɛs", "t": "tˈe", "u": "ˈy", "v": "vˈe",
       "w": "dˈublə vˈe", "x": "ˈiks", "y": "ˈi ɡʁˈɛk", "z": "zˈɛd"}
SON = {"a": "ˈa", "e": "ˈøː", "i": "ˈi", "o": "ˈo", "u": "ˈy", "y": "ˈi", "m": "ˈmː", "l": "ˈlː", "r": "ˈʁː", "s": "ˈsː", "f": "ˈfː",
       "v": "ˈvː", "z": "ˈzː", "j": "ˈʒː", "n": "ˈnː", "w": "ˈvː", "x": "kˈs", "p": "pˈə", "t": "tˈə", "b": "bˈə", "d": "dˈə",
       "c": "kˈə", "k": "kˈə", "q": "kˈə", "g": "ɡˈə"}
MOT_API = {"kiwi": "kiwˈi", "xylophone": "ksilɔfˈɔn", "rose": "ʁˈoz", "orange": "ɔʁˈɑ̃ʒ", "gorille": "ɡɔʁˈij", "soleil": "sɔlˈɛj",
           "image": "imˈaʒ", "renard": "ʁənˈaʁ", "stylo": "stilˈo", "hibou": "ibˈu", "wagon": "vaɡˈɔ̃", "quatre": "kˈatʁ", "tortue": "tɔʁtˈy"}
# Ce que la reconnaissance française peut écrire pour le son (voyelles : contrôle strict)
SON_TXT = {"a": {"a", "ah", "à", "as", "ha"}, "e": {"e", "eu", "euh", "eux", "œufs", "oeufs"}, "i": {"i", "y", "hi", "il"},
           "o": {"o", "oh", "eau", "au", "aux", "haut"}, "u": {"u", "hu", "hue", "eut", "eus", "eût", "us"}, "y": {"i", "y", "hi", "il"}}
def P(t): return "".join("".join(s) for s in v.phonemize(t)).rstrip(".")
def word_ipa(w): return MOT_API.get(w) or P(w)
def norm(s):
    s = unicodedata.normalize("NFD", s.lower()); s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z ]", " ", s).split()
def synth(ph, ls, ns, nw, out):
    a = np.clip(v.phoneme_ids_to_audio(v.phonemes_to_ids(list(ph)), SynthesisConfig(length_scale=ls, noise_scale=ns, noise_w_scale=nw)), -1, 1)
    with tempfile.NamedTemporaryFile(suffix=".wav") as t:
        with wave.open(t.name, "wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((a * 32767).astype("<i2").tobytes())
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", t.name, "-af", "adelay=80,apad=pad_dur=0.2,loudnorm=I=-16:TP=-1.5", "-ac", "1", "-ar", "24000", "-b:a", "64k", out], check=True)
def whisper(f):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-f", "s16le", "-ac", "1", "-ar", "16000", "-"], capture_output=True).stdout
    x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    return " ".join(s.text.strip() for s in W.transcribe(x, language="fr", beam_size=5)[0])
def ok(L, f, kind):
    w = norm(whisper(f)); word = norm(EX[L])
    if L == "h": return ("pas" in w and ("son" in w or "fait" in w)), " ".join(w)   # h muet : on vérifie « ne fait pas de son »
    # le mot exemple est cherché à la prononciation (Whisper écrit « l une » pour « lune »)
    if not set(word) <= set(w) and phon(EX[L]) not in phon(" ".join(w)).replace(" ", ""): return False, "mot absent : " + " ".join(w)
    if "son" not in w and L != "h": return False, "« son » absent : " + " ".join(w)
    if kind == "phrase" and "lettre" not in w and "lettres" not in w: return False, "« lettre » absent : " + " ".join(w)
    if L in SON_TXT:
        fr = norm(text_of(f))
        try: i = fr.index("son")
        except ValueError: return False, "fr sans « son » : " + " ".join(fr)
        after = fr[i + 1] if i + 1 < len(fr) else ""
        if after not in SON_TXT[L]: return False, f"son entendu « {after} » : " + " ".join(fr)
    return True, " ".join(w)
letters = [a for a in sys.argv[1:] if len(a) == 1] or sorted(EX)
for L in letters:
    for kind in ("phrase", "question"):
        if len(sys.argv) > 1 and "--seul" in sys.argv and f"{kind}-{L}" not in sys.argv: continue
        if L == "h":
            texte = "La lettre H ne fait pas de son, comme dans hibou." if kind == "phrase" else "La lettre H ne fait pas de son. Écoute : hibou."
            ph = P(texte)
        elif kind == "phrase":
            sep = ", " if L in ("u",) else " "   # petite pause : évite « sonlu »
            ph = f"{P('la lettre')} {NOM[L]} {P('fait le son')}{sep}{SON[L]}, {P('comme dans')} {word_ipa(EX[L])}."
        else:
            ph = f"{P('écoute le son')}, {SON[L]}, {P('comme dans')} {word_ipa(EX[L])}."
        out = str(R / "audio" / "lettres" / f"{kind}-{L}.mp3")
        good, why = False, ""
        for ls, ns, nw in list(itertools.product((1.05, 1.15, 0.95), (0.5, 0.3, 0.65), (0.6, 0.8))) * 2:
            synth(ph, ls, ns, nw, out)
            good, why = ok(L, out, kind)
            if good: break
        print(("OK    " if good else "ÉCHEC ") + f"{kind}-{L}", "|", why, flush=True)
