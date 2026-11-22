"""Pour chaque mot, syllabe ou phrase signalé, essaie plusieurs rendus et garde le premier
que la reconnaissance vocale (Whisper) comprend correctement. Résultat : tools/choix_voix.json,
utilisé ensuite par generer_voix.py."""
import json, subprocess, tempfile, wave, unicodedata, re, difflib, sys, pathlib, numpy as np
from piper import PiperVoice
from piper.config import SynthesisConfig
from faster_whisper import WhisperModel
R = pathlib.Path(__file__).resolve().parent.parent
v = PiperVoice.load("/tmp/voices/fr_FR-siwis-medium.onnx")
W = WhisperModel("small", device="cpu", compute_type="int8")
def norm(s):
    s=unicodedata.normalize("NFD",s.lower()); s="".join(c for c in s if unicodedata.category(c)!="Mn"); s=re.sub(r"[^a-z ]","",s)
    for a,b in [("eau","o"),("au","o"),("ai","e"),("ei","e"),("ph","f"),("qu","k"),("c","k"),("y","i"),("h","")]: s=s.replace(a,b)
    s=" ".join(re.sub(r"(s|t|x|d|e)$","",w) for w in s.split()); return re.sub(r"(.)\1+",r"\1",s.replace(" ",""))
def heard(ph, ls):
    a=np.clip(v.phoneme_ids_to_audio(v.phonemes_to_ids(list(ph)), SynthesisConfig(length_scale=ls, noise_scale=0.55, noise_w_scale=0.6)),-1,1)
    with tempfile.NamedTemporaryFile(suffix=".wav") as t:
        with wave.open(t.name,"wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(v.config.sample_rate); w.writeframes((a*32767).astype("<i2").tobytes())
        raw=subprocess.run(["ffmpeg","-v","error","-i",t.name,"-af","adelay=120,apad=pad_dur=0.6","-f","s16le","-ac","1","-ar","16000","-"],capture_output=True).stdout
    x=np.frombuffer(raw,np.int16).astype(np.float32)/32768
    return " ".join(s.text.strip() for s in W.transcribe(x,language="fr",beam_size=5)[0])
def phon(t): return "".join("".join(s) for s in v.phonemize(t))
def choose(key, expected, texts, apis):
    cands=[(phon(t),t) for t in texts]+[(a,"API "+a) for a in apis]
    best=None
    for ph,label in cands:
        for ls in (1.0,1.15,1.3):
            h=heard(ph,ls); r=difflib.SequenceMatcher(None,norm(expected),norm(h)).ratio()
            if best is None or r>best["score"]: best={"api":ph,"ls":ls,"source":label,"entendu":h,"score":round(r,2)}
            if r>=0.85: return best
    return best
jobs=json.load(open(sys.argv[1],encoding="utf-8"))
out_path=R/"tools"/"choix_voix.json"
res=json.load(open(out_path,encoding="utf-8")) if out_path.exists() else {}
for j in jobs:
    b=choose(j["key"], j["attendu"], j["textes"], j.get("api",[]))
    res[j["key"]]=b; print(j["key"], "->", b, flush=True)
json.dump(res,open(out_path,"w",encoding="utf-8"),ensure_ascii=False,indent=1)
