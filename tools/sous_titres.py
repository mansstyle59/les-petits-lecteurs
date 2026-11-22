"""Construit contenu/voix.json : pour chaque fichier audio, le texte exact que dit la voix (sous-titres de l'appli).
Usage : python3 tools/sous_titres.py   (à relancer après chaque génération de voix)"""
import re, ast, json, pathlib, unicodedata
R = pathlib.Path(__file__).resolve().parent.parent; A = R / "audio"
cours = json.load(open(R/"contenu/cours.json", encoding="utf-8"))
hist = json.load(open(R/"contenu/histoires.json", encoding="utf-8"))["histoires"]
src = (R/"tools/generer_voix.py").read_text(encoding="utf-8")
UI = ast.literal_eval(re.search(r"^UI = (\{.*?^\})", src, re.S | re.M).group(1))
ARTICLES = {}   # article réellement dit pour certains mots (vérifié à l'écoute)
try:
    for f, want, heard, s, st in json.load(open("/tmp/audit_complet.json", encoding="utf-8")):
        if f.startswith("mots/") and st == "OK":
            h = heard.strip().rstrip(".!")
            if want.lower() in h.lower() and len(h.split()) <= 3: ARTICLES[want] = h[0].upper() + h[1:]
except Exception: pass
V = {}
def add(key, text):
    if (A / (key + ".mp3")).exists() and text: V[key] = text.strip()
for k, t in UI.items(): add("ui/" + k, t)
SONS = {"a": "a", "e": "e", "i": "i", "o": "o", "u": "u", "y": "i", "m": "mmm", "l": "lll", "r": "rrr", "s": "sss", "f": "fff", "v": "vvv",
        "z": "zzz", "j": "jjj", "n": "nnn", "p": "p", "t": "t", "b": "b", "d": "d", "c": "k", "k": "k", "q": "k", "g": "g", "x": "ks", "w": "v", "h": "…"}
seen = set()
# Titres dits autrement que le texte affiché (prononciation des sons) : on écrit ce qui est vraiment dit
TITRE_DIT = {"L2": "Les sons continus.", "L3": "Les sons courts.", "L4": "De nouveaux sons.", "L5": "Encore de nouveaux sons.",
    "S1": "Les premières syllabes.", "S2": "De nouvelles syllabes.", "S3": "Encore des syllabes.", "S4": "Encore plus de syllabes.", "S5": "Les dernières syllabes.",
    "W1": "Les premiers mots.", "W2": "De nouveaux mots.", "W3": "Encore des mots.", "W4": "Les sons ch et ou.",
    "R1": "Révision des lettres.", "R2": "Révision des sons courts.", "R3": "Révision des dernières lettres.",
    "R4": "Toutes les lettres de A à M.", "R5": "Toutes les lettres de N à Z.",
    "Y1": "Les syllabes en a.", "Y2": "Les syllabes en i.", "Y3": "Les syllabes en o.", "Y4": "Les syllabes en u.", "Y5": "Les syllabes en e.",
    "C3": "Les sons an, in et oi.", "C4": "Mots avec an, in et oi.", "C5": "Les sons ch, eau et ai.", "C6": "Mots avec ch, eau et ai.", "D3": "Les sons gn, ill et ph."}
ARTICLES.update({"moto": "Une moto", "papa": "Papa", "feu": "Le feu"})
for m in cours["modules"]:
    add("titres/" + m["id"], m["titre"])
    for l in m["lecons"]:
        add("titres/" + l["id"], TITRE_DIT.get(l["id"], l["titre"])); add("consignes/" + l["id"], l["consigne"])
        for i, it in enumerate(l["items"]):
            if "lettre_minuscule" in it:
                x = it["lettre_minuscule"]; X = it.get("lettre_majuscule", x.upper()); s = SONS.get(x, x)
                for suf, ex in (("", it["exemple"]), ("-2", it.get("exemple_bis"))):
                    if not ex: continue
                    if x == "h":
                        add(f"lettres/phrase-h{suf}", f"La lettre H ne fait pas de son, comme dans {ex}.")
                        add(f"lettres/question-h{suf}", f"Quelle lettre ne fait pas de son, comme dans {ex} ?")
                    else:
                        add(f"lettres/phrase-{x}{suf}", f"La lettre {X} fait le son « {s} », comme dans {ex}.")
                        add(f"lettres/question-{x}{suf}", f"Écoute le son « {s} », comme dans {ex}.")
                add(f"lettres/son-{x}", s); add(f"lettres/nom-{x}", f"La lettre {X}.")
            if "syllabe_tts" in it: add("syllabes/" + it["syllabe_tts"], it.get("affiche") or it["syllabe_tts"])
            if "mot" in it and it["mot"] not in seen:
                seen.add(it["mot"]); add("mots/" + it["mot"], ARTICLES.get(it["mot"], it["mot"][0].upper() + it["mot"][1:]) + ".")
            if "phrase" in it and not it.get("audio"): add(f"phrases/{l['id']}-{i+1}", it["phrase"])
for h in hist:
    add(f"histoires/{h['id']}-titre", h["titre"])
    for i, pg in enumerate(h["pages"]): add(f"histoires/{h['id']}-{i+1}", pg[0])
add("prenoms/maelo", "Maëlo")
json.dump(V, open(R/"contenu/voix.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0, sort_keys=True)
print(len(V), "sous-titres")
