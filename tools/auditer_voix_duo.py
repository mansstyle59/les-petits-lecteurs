"""Contrôle automatique des encouragements générés avec la voix masculine Piper.

Whisper sert de filtre de détection : un score faible demande une écoute humaine.
Ce contrôle ne remplace pas une relecture par un spécialiste de l'apprentissage.
"""
import difflib
import pathlib
import re
import subprocess
import sys
import unicodedata

import numpy as np
from faster_whisper import WhisperModel

ROOT = pathlib.Path(__file__).resolve().parent.parent
EXPECTED = {
    "bravo": "Bravo !",
    "super": "Super, tu as trouvé !",
    "etoile": "Tu as gagné des étoiles !",
    "fin": "Bravo ! Tu as fini la leçon.",
    "bien-dit": "Bien dit !",
    "super-prenom": "Super",
    "trophee": "Et tu as gagné un trophée !",
    "courage": "Tu y es presque, continue !",
    "genial": "Génial !",
    "champion": "Quel champion !",
    "revision-fin": "Super ! Tes erreurs sont corrigées.",
    "cadeau": "Bravo ! Tu as gagné un cadeau. Montre-le à papa ou maman !",
    "encore": "Essaie encore.",
    "reessaie": "À toi, essaie encore !",
    "repete": "À toi, répète !",
    "prochaine": "Maintenant, on passe à la leçon suivante !",
}

def normaliser(value):
    value = unicodedata.normalize("NFD", value.lower())
    value = "".join(c for c in value if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", value).strip()

def lire_audio(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", "16000",
         "-f", "s16le", "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0

def main():
    model = WhisperModel("small", device="cpu", compute_type="int8")
    failures = []
    review = []
    results = {}
    print("| Fichier | Attendu | Reconnu | Score | Résultat |")
    print("|---|---|---|---:|---|")
    for key, expected in EXPECTED.items():
        path = ROOT / "audio" / "ui" / (key + ".mp3")
        if not path.is_file():
            failures.append(key)
            print(f"| {key}.mp3 | {expected} | fichier absent | 0 | ÉCHEC |")
            continue
        segments, _ = model.transcribe(lire_audio(path), language="fr", beam_size=5)
        heard = " ".join(segment.text.strip() for segment in segments).strip()
        score = difflib.SequenceMatcher(
            None, normaliser(expected), normaliser(heard)
        ).ratio()
        results[key] = (heard, score)
        status = "OK" if score >= 0.75 else "À ÉCOUTER"
        if score < 0.55:
            failures.append(key)
        elif score < 0.75:
            review.append(key)
        print(f"| {key}.mp3 | {expected} | {heard} | {score:.2f} | {status} |")
    print("\nSynthèse :")
    print(f"- Fichiers contrôlés : {len(EXPECTED)}")
    print(f"- À écouter : {len(review)}" + (f" ({', '.join(review)})" if review else " (aucun)"))
    print(f"- Échecs sévères : {len(failures)}" + (f" ({', '.join(failures)})" if failures else " (aucun)"))
    report = ROOT / "contenu" / "AUDIT_RECONNAISSANCE_VOIX_DUO.md"
    rows = [
        "| Fichier | Attendu | Reconnu | Score | Résultat |",
        "|---|---|---|---:|---|",
    ]
    for key, expected in EXPECTED.items():
        heard, score = results.get(key, ("Fichier absent", 0.0))
        status = "OK" if score >= 0.75 else "À ÉCOUTER"
        rows.append(f"| {key}.mp3 | {expected} | {heard} | {score:.2f} | {status} |")
    report.write_text(
        "# Contrôle automatique des encouragements\n\n"
        "Reconnaissance Whisper (modèle small). Ce contrôle repère des écarts possibles ; "
        "il ne constitue pas une validation pédagogique ou une écoute humaine.\n\n"
        + "\n".join(rows) + "\n",
        encoding="utf-8",
    )
    if failures:
        print("Contrôle incomplet ou prononciation très différente : vérifier le rapport et écouter les fichiers.", file=sys.stderr)

if __name__ == "__main__":
    main()
