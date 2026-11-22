"""Reconnaissance française (wav2vec2-large-xlsr-53-french) pour vérifier syllabes et mots courts."""
import subprocess, numpy as np, torch, unicodedata, re
from transformers import Wav2Vec2Processor, Wav2Vec2ForCTC
MODEL = "jonatasgrosman/wav2vec2-large-xlsr-53-french"
_p = Wav2Vec2Processor.from_pretrained(MODEL); _m = Wav2Vec2ForCTC.from_pretrained(MODEL).eval()
def text_of(mp3, delay=200, pad=0.4):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(mp3), "-af", f"adelay={delay},apad=pad_dur={pad}", "-f", "s16le", "-ac", "1", "-ar", "16000", "-"], capture_output=True).stdout
    x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    inp = _p(x, sampling_rate=16000, return_tensors="pt")
    with torch.no_grad(): ids = torch.argmax(_m(inp.input_values).logits, dim=-1)
    return _p.batch_decode(ids)[0].strip()
def phon(t):
    """Forme sonore approximative d'un texte français (homophones ramenés à la même forme)."""
    t = t.lower().replace("ç", "s")
    t = unicodedata.normalize("NFD", t); t = "".join(c for c in t if unicodedata.category(c) != "Mn" or c == "̈")
    t = re.sub(r"[^a-z ]", "", t)
    out = []
    for w in t.split():
        w = re.sub(r"(eau|au|ot|os|aut|aux|o)", "o", w)
        w = w.replace("ch", "§").replace("qu", "k").replace("ph", "f")
        w = re.sub(r"c(?=[eiy])", "s", w); w = w.replace("c", "k")
        w = re.sub(r"g(?=[eiy])", "j", w); w = re.sub(r"gu(?=[ei])", "g", w)
        w = w.replace("ai", "è").replace("ei", "è").replace("et", "è") if len(w) > 2 else w.replace("ai", "è")
        w = re.sub(r"(an|en|am|em)(?![aeiouy])", "@", w); w = re.sub(r"(aim|ain|ein|in|im|un)(?![aeiouy])", "#", w)
        w = re.sub(r"(on|om)(?![aeiouy])", "%", w); w = w.replace("ou", "u_").replace("oi", "wa")
        w = w.replace("h", "").replace("y", "i")
        w = re.sub(r"(e|es|s|t|ts|x|d|ds|p|z)$", "", w) if len(w) > 2 else re.sub(r"(s|t|x|d|z)$", "", w)
        w = w.replace("è", "e")
        w = re.sub(r"(.)\1+", r"\1", w)
        out.append(w)
    return "".join(out)
