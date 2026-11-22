"""Vérifie chaque syllabe (audio/syllabes) avec la reconnaissance phonétique et refait celles qui sont fausses."""
import sys, json, itertools, subprocess, tempfile, wave, pathlib, numpy as np
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from francais_check import text_of, phon
from piper import PiperVoice
from piper.config import SynthesisConfig
R = pathlib.Path(__file__).resolve().parent.parent
exec(open(R / "tools" / "generer_voix.py", encoding="utf-8").read().split("def syllabe_api")[0].split("# Nom des lettres")[0].replace("v = PiperVoice.load(VOICE)", "").replace("cours = json", "_c = json"), globals()) if False else None
src = open(R / "tools" / "generer_voix.py", encoding="utf-8").read()
ns = {}
ns["SynthesisConfig"] = SynthesisConfig
exec(src[src.index("CONS = {"):src.index("# Corrections de mots")], ns)
syllabe_api = ns["syllabe_api"]
v = PiperVoice.load("/tmp/voices/fr_FR-siwis-medium.onnx"); SR = v.config.sample_rate
EQ = {"ɑ": "a", "ɛ": "e", "ɔ": "o", "ʉ": "y", "ø": "ə", "œ": "ə", "əɜ": "ə", "ɜ": "ə", "r": "ʁ", "ʀ": "ʁ", "ɹ": "ʁ", "g": "ɡ", "ɑ̃": "ɑ̃"}
def norm_toks(s):
    out = []
    for t in s.replace("ˈ", "").split():
        t = t.replace("ː", ""); t = EQ.get(t, t)
        if t in ("ʔ", "|", ""): continue
        out.append(t)
    return out
def expected(s):
    ipa = syllabe_api(s).replace("ˈ", "").replace("ː", "")
    toks, i = [], 0
    while i < len(ipa):
        ch = ipa[i]
        if i + 1 < len(ipa) and ipa[i + 1] == "̃": ch += "̃"; i += 1
        toks.append(EQ.get(ch, ch)); i += 1
    return toks
def good(s, got):
    e, g = expected(s), norm_toks(got)
    if g == e: return True
    if e and e[-1] == "ə" and g == e[:-1]: return True  # e muet final très bref
    if s == "oi" and g in (["w", "a"], ["u", "a"]): return True
    return False
HOMO = {"le": {"le", "leu", "l"}, "me": {"me", "meu", "m"}, "ne": {"ne", "n"}, "se": {"se", "s", "ce"}, "te": {"te", "t"},
        "de": {"de", "d"}, "je": {"je", "j"}, "pe": {"pe", "peu", "p"}, "be": {"be", "beu", "b"}, "fe": {"fe", "feu", "f"},
        "ve": {"ve", "veu", "v"}, "re": {"re", "reu", "r"}, "on": {"on", "%"}, "an": {"an", "en", "@"}, "in": {"in", "#", "un"},
        "ai": {"ai", "e", "es", "est", "et", "è"}, "eau": {"eau", "o", "au", "oh"},
        "ga": {"gars", "ga"}, "lai": {"les", "lait", "laid", "lai", "lès"}, "mai": {"mai", "mais", "mes", "mets"}, "fin": {"fin", "faim", "feint"},
        "nu": {"nu", "nue", "nus"}, "pu": {"pu", "pus", "pue"}, "ji": {"ji", "gi", "j"}, "cu": {"cu", "qu", "q", "cul"},
        "son": {"son", "sont"}, "bon": {"bon", "bond"}, "non": {"non", "nom"}, "toi": {"toi", "toit"}, "moi": {"moi", "mois"},
        "lou": {"loup", "lou", "loue"}, "pou": {"pou", "pous"}, "mou": {"mou", "moue"}, "ro": {"ro", "rot", "rots"}}
def good(s, txt):
    t = txt.strip()
    if not t or len(t.split()) > 1: return False
    if phon(t) == phon(s): return True
    return s in HOMO and (t in HOMO[s] or phon(t) in {phon(x) for x in HOMO[s]})
def listen(mp3): return [text_of(mp3, d, p) for d, p in ((100, 0.2), (200, 0.4), (350, 0.6))]
def robust(s, mp3):
    r = listen(mp3); return sum(good(s, g) for g in r) >= 2, r
cours = json.load(open(R / "contenu" / "cours.json", encoding="utf-8"))
syls = sorted({it["syllabe_tts"] for m in cours["modules"] for l in m["lecons"] for it in l["items"] if "syllabe_tts" in it})
fix = "--corriger" in sys.argv
bad = []
for s in syls:
    f = R / "audio" / "syllabes" / f"{s}.mp3"
    okk, r = robust(s, f)
    if okk: continue
    if fix:
        ipa = syllabe_api(s); done = False
        for rep, ph, ls, nsc, nw in itertools.product(range(3), [ipa, ipa.replace("ˈ", ""), ipa + ".", ipa + "ː", ipa + "!"], (0.85, 1.0, 1.3), (0.3, 0.55), (0.4, 0.8)):
            a = np.clip(v.phoneme_ids_to_audio(v.phonemes_to_ids(list(ph)), SynthesisConfig(length_scale=ls, noise_scale=nsc, noise_w_scale=nw)), -1, 1)
            with tempfile.NamedTemporaryFile(suffix=".wav") as t, tempfile.NamedTemporaryFile(suffix=".mp3") as m:
                with wave.open(t.name, "wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((a * 32767).astype("<i2").tobytes())
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", t.name, "-af", "adelay=80,apad=pad_dur=0.15,loudnorm=I=-16:TP=-1.5", "-ac", "1", "-ar", "24000", "-b:a", "64k", m.name], check=True)
                okk2, r2 = robust(s, m.name)
                if okk2:
                    subprocess.run(["cp", m.name, str(f)], check=True); done = True; break
        print(("CORRIGÉE " if done else "ÉCHEC    ") + s, "| avant:", r[1], flush=True)
        if not done: bad.append(s)
    else:
        print("FAUSSE", s, "| entendu:", r, flush=True); bad.append(s)
print("Syllabes vérifiées:", len(syls), "| restent fausses:", " ".join(bad) or "aucune")
