"""Vérifie les fichiers réels audio/lettres/son-*.mp3 avec la reconnaissance phonétique."""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from phonemes_check import phonemes
from choisir_sons import ok, TARGET, robuste
R = pathlib.Path(__file__).resolve().parent.parent
bad = []
for L in "abcdefghijklmnopqrstuvwxyz":
    if L == "h": continue
    f = R / "audio" / "lettres" / f"son-{L}.mp3"
    got = phonemes(f)
    good = robuste("v" if L == "w" else L, str(f))
    print(("OK   " if good else "FAUX ") + L, "->", got)
    if not good: bad.append(L)
print("À refaire:", " ".join(bad) or "aucun")
