import json, wave, pathlib, subprocess, sys, tempfile
from piper import PiperVoice
try:
    from piper import SynthesisConfig
    CFG = SynthesisConfig(length_scale=1.18, noise_scale=0.6, noise_w_scale=0.7)
except Exception:
    CFG = None
REPO = pathlib.Path(sys.argv[1])
OUT = REPO/"audio"
v = PiperVoice.load("/tmp/voices/fr_FR-siwis-medium.onnx")
cours = json.loads((REPO/"contenu/cours.json").read_text(encoding="utf-8"))

NOM = {"a":"A.","b":"Bé.","c":"Cé.","d":"Dé.","e":"Euh.","f":"Èffe.","g":"Gé.","h":"Ache.","i":"I.","j":"Ji.","k":"Ka.","l":"Èle.","m":"Ème.","n":"Ène.","o":"O.","p":"Pé.","q":"Ku.","r":"Ère.","s":"Èsse.","t":"Té.","u":"U.","v":"Vé.","w":"Double vé.","x":"Ixe.","y":"I grec.","z":"Zède."}
SON = {"a":"A.","e":"É.","i":"I.","o":"Oh.","u":"U.","m":"Mmmmmm.","l":"Llllll.","r":"Rrrrrr.","s":"Sssssss.","f":"Ffffff.","v":"Vvvvvv.","z":"Zzzzzz.","j":"Jjjjjj.","n":"Nnnnnn.","p":"Peu.","t":"Teu.","b":"Beu.","d":"Deu.","c":"Keu.","k":"Keu.","g":"Gueu.","q":"Keu.","x":"Ksss.","y":"I.","w":"Vvvvvv.","h":"La lettre H ne fait pas de son."}
SYL = {"pe":"Peu.","be":"Beu.","fe":"Feu.","ve":"Veu.","re":"Reu.","ca":"Ka.","co":"Ko.","cu":"Ku.","gu":"Gû.","ji":"Ji.","ju":"Ju.","mu":"Mu.","nu":"Nu."}
UI = {
 "bravo":"Bravo !","super":"Super, tu as trouvé !","encore":"Essaie encore.","etoile":"Tu as gagné une étoile !",
 "fin":"Bravo ! Tu as fini la leçon.","choisis-lecon":"Choisis une leçon.","qui-joue":"Qui joue aujourd'hui ?",
 "decouvre":"Touche une carte pour écouter.","jouer":"À toi de jouer !","ecoute":"Écoute bien.",
 "bienvenue":"Bienvenue chez les Petits Lecteurs !","ajoute-profil":"Ajoute ton prénom pour commencer.",
}

def synth(text, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists(): return
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        with wave.open(tmp.name,"wb") as w:
            if CFG: v.synthesize_wav(text, w, syn_config=CFG)
            else: v.synthesize_wav(text, w)
        subprocess.run(["ffmpeg","-v","error","-y","-i",tmp.name,"-af","adelay=80,apad=pad_dur=0.15,loudnorm=I=-16:TP=-1.5","-ac","1","-ar","24000","-b:a","48k",str(path)],check=True)

n=0
for k,t in UI.items(): synth(t, OUT/"ui"/f"{k}.mp3"); n+=1
for m in cours["modules"]:
    synth(m["titre"]+".", OUT/"titres"/f"{m['id']}.mp3"); n+=1
    for l in m["lecons"]:
        synth(l["titre"].replace(":",",")+".", OUT/"titres"/f"{l['id']}.mp3")
        synth(l["consigne"], OUT/"consignes"/f"{l['id']}.mp3"); n+=2
        for it in l["items"]:
            if "lettre_minuscule" in it:
                L=it["lettre_minuscule"]
                synth(NOM[L], OUT/"lettres"/f"nom-{L}.mp3")
                synth(SON[L], OUT/"lettres"/f"son-{L}.mp3")
                synth(f"{it['exemple'].capitalize()}.", OUT/"mots"/f"{it['exemple']}.mp3"); n+=3
            elif "syllabe_tts" in it:
                s=it["syllabe_tts"]; synth(SYL.get(s, s.capitalize()+"."), OUT/"syllabes"/f"{s}.mp3"); n+=1
            elif "mot" in it:
                synth(it["mot"].capitalize()+".", OUT/"mots"/f"{it['mot']}.mp3"); n+=1
            else:
                i=l["items"].index(it)+1; synth(it["phrase"], OUT/"phrases"/f"{l['id']}-{i}.mp3"); n+=1
print("fichiers:", n)
