"""Reconnaissance phonème par phonème (wav2vec2 « espeak-cv-ft ») pour vérifier les sons isolés."""
import subprocess, numpy as np, torch, sys
from transformers import AutoProcessor, AutoModelForCTC
MODEL = "facebook/wav2vec2-lv-60-espeak-cv-ft"
_proc = AutoProcessor.from_pretrained(MODEL)
_model = AutoModelForCTC.from_pretrained(MODEL).eval()
def load(f, pad=0.3):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(f), "-af", f"adelay=200,apad=pad_dur={pad}", "-f", "s16le", "-ac", "1", "-ar", "16000", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768
def phonemes_of_array(x):
    inp = _proc(x, sampling_rate=16000, return_tensors="pt")
    with torch.no_grad():
        ids = torch.argmax(_model(inp.input_values).logits, dim=-1)
    return _proc.batch_decode(ids)[0].strip()
def phonemes(f): return phonemes_of_array(load(f))
if __name__ == "__main__":
    for f in sys.argv[1:]: print(f, "->", phonemes(f))
