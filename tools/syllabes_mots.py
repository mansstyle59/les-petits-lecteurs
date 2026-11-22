"""Refait les syllabes en les faisant dire comme un vrai mot français homophone
(« ri » = riz, « ro » = rôt, « le » = le…), puis vérifie chaque fichier avec la
reconnaissance française (au moins 2 écoutes sur 3 correctes). Garde le fichier validé."""
import json, sys, itertools, subprocess, tempfile, wave, pathlib, numpy as np
from piper import PiperVoice
from piper.config import SynthesisConfig
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from francais_check import text_of, phon
R = pathlib.Path(__file__).resolve().parent.parent
v = PiperVoice.load("/tmp/voices/fr_FR-siwis-medium.onnx"); SR = v.config.sample_rate
MOTS = {  # syllabe : mots homophones à faire dire (le premier est préféré)
 "ma": ["ma", "mas"], "me": ["me"], "mi": ["mie", "mi"], "mo": ["mot", "maux"], "mu": ["mue", "mu"],
 "la": ["la", "là"], "le": ["le"], "li": ["lit", "lie"], "lo": ["lot", "l'eau"], "lu": ["lu", "lue"],
 "ra": ["rat", "ras"], "re": ["re"], "ri": ["riz", "rit", "ris"], "ro": ["rôt", "rot"], "ru": ["rue", "ru"],
 "pa": ["pas", "pa"], "pe": ["pe"], "pi": ["pie", "pis"], "po": ["pot", "peau"], "pu": ["pu", "pue"],
 "ta": ["ta", "tas"], "te": ["te"], "ti": ["ti"], "to": ["tôt", "taux"], "tu": ["tu", "tue"],
 "ba": ["bas", "bah"], "be": ["be"], "bi": ["bi"], "bo": ["beau", "bot"], "bu": ["bu", "but"],
 "da": ["da"], "de": ["de"], "di": ["dit", "dis"], "do": ["dos", "do"], "du": ["du", "dû"],
 "fa": ["fa"], "fe": ["fe"], "fi": ["fi"], "fo": ["faux", "faut"], "fu": ["fut", "fût"],
 "sa": ["sa", "ça"], "se": ["se", "ce"], "si": ["si", "scie"], "so": ["seau", "sot", "saut"], "su": ["su", "sue"],
 "va": ["va", "vas"], "ve": ["ve"], "vi": ["vit", "vie"], "vo": ["veau", "vaut"], "vu": ["vu", "vue"],
 "ja": ["ja"], "je": ["je"], "ji": ["ji"], "jo": ["jo"], "ju": ["jus"],
 "na": ["na"], "ne": ["ne"], "ni": ["nid", "ni"], "no": ["nos", "nô"], "nu": ["nu", "nue"],
 "ca": ["cas", "ka"], "co": ["ko", "cot"], "cu": ["ku"], "ga": ["gars", "ga"], "go": ["go", "gogo"], "gu": ["gu"],
}
OK_TXT = {s: set(ws) | {s} for s, ws in MOTS.items()}
EXTRA = {"le": {"leu", "l"}, "me": {"meu", "m"}, "ne": {"neu", "n", "nœud"}, "re": {"reu", "r", "rre"}, "te": {"teu", "t"}, "de": {"deu", "d", "deux"},
         "se": {"seu", "s"}, "je": {"jeu", "j"}, "pe": {"peu", "p"}, "be": {"beu", "b"}, "fe": {"feu", "f"}, "ve": {"veu", "v", "vœu", "veux"},
         "mi": {"mie", "mis", "mit"}, "lu": {"lu", "lus", "lut"}, "su": {"su", "sus", "sue"}, "cu": {"ku", "q", "qu"}, "gu": {"gu", "gue"},
         "ji": {"ji", "gît", "gi"}, "jo": {"jo", "geo", "jot"}, "ti": {"ti", "thi", "tie"}, "bi": {"bi", "bis"}, "fi": {"fi", "fit", "fis"},
         "ja": {"ja", "jas"}, "da": {"da", "dah"}, "na": {"na", "nah"}, "fa": {"fa", "fat"}, "ga": {"gars", "ga", "gas"}, "go": {"go", "gaut"}}
for k, e in EXTRA.items(): OK_TXT.setdefault(k, set()).update(e)
def good(s, t):
    t = t.strip().lower()
    if not t or len(t.split()) > 1: return False
    return t in OK_TXT.get(s, {s}) or phon(t) in {phon(x) for x in OK_TXT.get(s, {s})}
def P(t): return "".join("".join(x) for x in v.phonemize(t))
def render(ph, ls, ns, nw, out):
    a = np.clip(v.phoneme_ids_to_audio(v.phonemes_to_ids(list(ph)), SynthesisConfig(length_scale=ls, noise_scale=ns, noise_w_scale=nw)), -1, 1)
    with tempfile.NamedTemporaryFile(suffix=".wav") as t:
        with wave.open(t.name, "wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((a * 32767).astype("<i2").tobytes())
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", t.name, "-af", "adelay=80,apad=pad_dur=0.15,loudnorm=I=-16:TP=-1.5", "-ac", "1", "-ar", "24000", "-b:a", "64k", out], check=True)
def robust(s, f):
    r = [text_of(f, d, p) for d, p in ((100, 0.2), (200, 0.4), (350, 0.6))]
    return sum(good(s, x) for x in r) >= 2, r
EIPA = {"le": "lə", "me": "mə", "ne": "nə", "re": "ʁə", "te": "tə", "de": "də", "se": "sə", "je": "ʒə", "pe": "pə", "be": "bə", "fe": "fə", "ve": "və"}
cours = json.load(open(R / "contenu" / "cours.json", encoding="utf-8"))
syls = sorted({it["syllabe_tts"] for m in cours["modules"] for l in m["lecons"] for it in l["items"] if "syllabe_tts" in it})
todo = [a for a in sys.argv[1:]] or [s for s in syls if s in MOTS]
report = {}
for s in todo:
    out = str(R / "audio" / "syllabes" / f"{s}.mp3")
    cands = []
    for w in MOTS.get(s, [s]):
        cands.append((P(w.capitalize() + "."), "mot « " + w + " »"))
    if s in EIPA: cands += [(EIPA[s] + ".", "API " + EIPA[s]), ("ˈ" + EIPA[s] + ".", "API accentuée")]
    found = None
    for (ph, label), ls, ns in itertools.product(cands, (1.0, 1.1, 0.92), (0.4, 0.6)):
        with tempfile.NamedTemporaryFile(suffix=".mp3") as tmp:
            render(ph, ls, ns, 0.6, tmp.name)
            okk, r = robust(s, tmp.name)
            if okk:
                subprocess.run(["cp", tmp.name, out], check=True); found = (label, r); break
    report[s] = found
    print(("OK    " if found else "ÉCHEC ") + s, "|", found if found else "", flush=True)
json.dump({k: (v[0] if v else None) for k, v in report.items()}, open("/tmp/syllabes_rapport.json", "w"), ensure_ascii=False)
