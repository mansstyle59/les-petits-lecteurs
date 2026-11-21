"""Génère toutes les voix de l'application (voix Piper fr_FR « siwis »).

Prononciation : les lettres, les sons et les syllabes sont fournis au moteur
directement en alphabet phonétique international (API), selon la prononciation
standard du français de France, au lieu de laisser le moteur deviner (il épelait
par exemple « Mmmm » en « èm èm èm »). Les mots et phrases passent par le
dictionnaire phonétique français d'espeak-ng, puis sont vérifiés (audit).

Usage : python3 tools/generer_voix.py [dossier_du_depot] [--tout]
  --tout : régénère aussi les fichiers déjà présents.
"""
import json, wave, pathlib, subprocess, sys, tempfile
from piper import PiperVoice
from piper.config import SynthesisConfig

REPO = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else ".").resolve()
TOUT = "--tout" in sys.argv
OUT = REPO / "audio"
VOICE = "/tmp/voices/fr_FR-siwis-medium.onnx"
v = PiperVoice.load(VOICE)
CFG = SynthesisConfig(length_scale=1.15, noise_scale=0.55, noise_w_scale=0.6)
cours = json.loads((REPO / "contenu/cours.json").read_text(encoding="utf-8"))

# ---------- Dictionnaire phonétique (API, français de France) ----------
# Nom des lettres de l'alphabet
NOM_API = {
    "a": "ˈa", "b": "bˈe", "c": "sˈe", "d": "dˈe", "e": "ˈə", "f": "ˈɛf", "g": "ʒˈe", "h": "ˈaʃ",
    "i": "ˈiː", "j": "ʒˈi", "k": "kˈa", "l": "ˈɛl", "m": "ˈɛm", "n": "ˈɛn", "o": "ˈo", "p": "pˈe",
    "q": "kˈy", "r": "ˈɛʁ", "s": "ˈɛs", "t": "tˈe", "u": "ˈy", "v": "vˈe", "w": "dˈublə vˈe",
    "x": "ˈiks", "y": "ˈi ɡʁˈɛk", "z": "zˈɛd",
}
# Son utile à la lecture (consonnes continues allongées, consonnes courtes + « e » bref)
SON_API = {
    "a": "ˈaː", "e": "ˈeː", "i": "ˈiː", "o": "ˈoː", "u": "ˈyː", "y": "ˈiː",
    "m": "ˈmːː", "l": "ˈlːː", "r": "ˈʁːː", "s": "ˈsːː", "f": "ˈfːː", "v": "ˈvːː", "z": "ˈzːː",
    "j": "ˈʒːː", "n": "ˈnːː", "w": "ˈvːː", "x": "kˈsːː",
    "p": "pˈə", "t": "tˈə", "b": "bˈə", "d": "dˈə", "c": "kˈə", "k": "kˈə", "q": "kˈə", "g": "ɡˈə",
}
CONS = {"m": "m", "l": "l", "r": "ʁ", "s": "s", "f": "f", "v": "v", "z": "z", "j": "ʒ", "n": "n",
        "p": "p", "t": "t", "b": "b", "d": "d", "c": "k", "g": "ɡ"}
VOY = {"a": "a", "e": "ə", "i": "i", "o": "o", "u": "y"}
def syllabe_api(s):
    return CONS[s[0]] + "ˈ" + VOY[s[1]] + "ː"

# Corrections de mots si l'audit en trouve (mot -> API). Vide si tout est correct.
MOTS_API = {
    "kiwi": "kiwˈi.", "xylophone": "ksilɔfˈɔn.", "rose": "ʁˈoz.", "olive": "ɔlˈiv.",
    "gorille": "ɡɔʁˈij.", "soleil": "sɔlˈɛj.", "moto": "mɔtˈo.", "image": "imˈaʒ.",
}
PHRASES_API = {
    "Lili a un lama.": "lilˈi a œ̃ lamˈa.",
    "Maman a une moto.": "mamˈɑ̃ a yn mɔtˈo.",
}
PRENOMS_API = {"maelo": "maelˈo,"}

UI = {
    "bravo": "Bravo !", "super": "Super, tu as trouvé !", "encore": "Essaie encore.", "etoile": "Tu as gagné une étoile !",
    "fin": "Bravo ! Tu as fini la leçon.", "choisis-lecon": "Choisis une leçon.", "qui-joue": "Qui joue aujourd'hui ?",
    "decouvre": "Touche une carte pour écouter.", "jouer": "À toi de jouer !", "ecoute": "Écoute bien.",
    "bienvenue": "Bienvenue chez les Petits Lecteurs !", "ajoute-profil": "Écris ton prénom, puis choisis ton animal.",
    "q-lettre-nom": "C'est quoi, cette lettre ?", "q-lettre-son": "Et voici son son. Écoute.",
    "q-syllabe": "Lis cette syllabe.", "q-mot": "Lis ce mot.", "q-phrase": "Lis cette phrase.",
    "a-toi-micro": "À toi ! Appuie sur le micro, et dis-le bien fort.", "bien-dit": "Bien dit !",
    "pas-entendu": "Je n'ai pas bien entendu. Tu peux réessayer.", "parlons": "Maintenant, à toi de parler !",
    "bonjour": "Bonjour", "age": "Quel âge as-tu ?", "ecoute-toi": "Écoute ta voix.", "super-prenom": "Super",
    "trophee": "Et tu as gagné un trophée !", "prochaine": "Maintenant, on passe à la leçon suivante !",
    "courage": "Tu y es presque, continue !", "genial": "Génial !", "champion": "Quel champion !",
    "pause": "C'est fini pour aujourd'hui. Bravo pour ton travail ! On se retrouve demain.",
    "presque-fini": "Encore une petite leçon, et c'est la pause !",
    "inscription": "Avec papa, maman, ou un adulte : appuie sur le micro, et dis ton prénom et ton âge.",
    "inscription-ecrit": "Avec un adulte, écris ton prénom, puis choisis ton âge et ton animal.",
    "compris": "J'ai compris ! C'est bien ça ?",
    "pas-compris": "Je n'ai pas bien compris. Tu peux répéter, ou demander à un adulte de l'écrire.",
    "animal": "Maintenant, choisis ton animal.",
    "cadeau": "Bravo ! Tu as gagné un cadeau. Montre-le à papa ou maman !",
    "cadeaux": "Voici tes cadeaux. Gagne des étoiles pour les débloquer !",
    "revision": "On révise les petites erreurs. C'est comme ça qu'on devient fort !",
    "revision-fin": "Super ! Tes erreurs sont corrigées.",
}
PRENOMS = {"maelo": "Maëlo,"}

def to_wav(phonemes, path_wav):
    ids = v.phonemes_to_ids(list(phonemes))
    audio = v.phoneme_ids_to_audio(ids, CFG)
    import numpy as np
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()
    with wave.open(str(path_wav), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(v.config.sample_rate); w.writeframes(pcm)

def text_phonemes(text):
    out = []
    for sent in v.phonemize(text):
        out.extend(sent)
    return "".join(out)

AUDIT = []
def synth(path, text=None, api=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    ph = api if api is not None else text_phonemes(text)
    AUDIT.append((str(path.relative_to(OUT)), text or "", ph, api is not None))
    if path.exists() and not TOUT:
        return
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        to_wav(ph, tmp.name)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp.name, "-af",
                        "adelay=80,apad=pad_dur=0.15,loudnorm=I=-16:TP=-1.5", "-ac", "1", "-ar", "24000", "-b:a", "48k", str(path)], check=True)

for k, t in UI.items(): synth(OUT / "ui" / f"{k}.mp3", t)
for k, t in PRENOMS.items(): synth(OUT / "prenoms" / f"{k}.mp3", t, PRENOMS_API.get(k))
for m in cours["modules"]:
    synth(OUT / "titres" / f"{m['id']}.mp3", m["titre"] + ".")
    for l in m["lecons"]:
        synth(OUT / "titres" / f"{l['id']}.mp3", l["titre"].replace(":", ",").replace(" h, q", " ache, ku").replace(" x, y, w", " ixe, i grec, double vé") + ".")
        synth(OUT / "consignes" / f"{l['id']}.mp3", l["consigne"])
        for i, it in enumerate(l["items"]):
            if "lettre_minuscule" in it:
                L = it["lettre_minuscule"]
                synth(OUT / "lettres" / f"nom-{L}.mp3", f"[nom de la lettre {L}]", NOM_API[L])
                if L == "h":
                    synth(OUT / "lettres" / "son-h.mp3", "La lettre H ne fait pas de son.")
                else:
                    synth(OUT / "lettres" / f"son-{L}.mp3", f"[son de la lettre {L}]", SON_API[L])
                ex = it["exemple"]
                synth(OUT / "mots" / f"{ex}.mp3", ex.capitalize() + ".", MOTS_API.get(ex))
            elif "syllabe_tts" in it:
                s = it["syllabe_tts"]
                synth(OUT / "syllabes" / f"{s}.mp3", f"[syllabe {s}]", syllabe_api(s))
            elif "mot" in it:
                synth(OUT / "mots" / f"{it['mot']}.mp3", it["mot"].capitalize() + ".", MOTS_API.get(it["mot"]))
            else:
                synth(OUT / "phrases" / f"{l['id']}-{i + 1}.mp3", it["phrase"], PHRASES_API.get(it["phrase"]))

# Rapport de prononciation (relecture humaine)
lines = ["# Audit de prononciation", "", "Transcription phonétique (API) envoyée au moteur vocal pour chaque fichier.",
         "« imposée » = prononciation fixée à la main (dictionnaire de l'application) ; « dictionnaire » = dictionnaire français d'espeak-ng.", "",
         "| Fichier | Texte | API | Source |", "|---|---|---|---|"]
for f, t, ph, forced in AUDIT:
    lines.append(f"| {f} | {t} | {ph} | {'imposée' if forced else 'dictionnaire'} |")
(REPO / "contenu" / "AUDIT_PRONONCIATION.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
json.dump([{"fichier": f, "texte": t, "api": ph} for f, t, ph, _ in AUDIT], open("/tmp/audit_voix.json", "w"), ensure_ascii=False)
print("fichiers:", len(AUDIT))
