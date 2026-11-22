"""Découpe guidée (pics phonétiques) + validation stricte du MP3 final, pour les sons difficiles."""
import sys, itertools, subprocess, tempfile, numpy as np, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
exec(open(pathlib.Path(__file__).parent / "couper_sons2.py").read().split("JOBS = ")[0])
from choisir_sons import robuste
IPA = {"m": "m", "l": "l", "v": "v", "n": "n", "z": "z", "s": "s", "f": "f", "j": "ʒ", "r": "ʁ"}
for L in sys.argv[1:]:
    c = IPA[L]; done = False
    srcs = [f"ˈ{c}ː", f"{c}ːː", f"ˈ{c}{c}{c}", f"ˈa{c}ː", f"ˈɑ{c}ː", f"ˈa{c}a", f"ˈɔ{c}ː"]
    for rep, (ph, ls, ns, nw) in itertools.product(range(3), itertools.product(srcs, (0.85, 1.0, 1.3, 1.6), (0.3, 0.55), (0.4, 0.8))):
        a = np.clip(v.phoneme_ids_to_audio(v.phonemes_to_ids(list(ph)), SynthesisConfig(length_scale=ls, noise_scale=ns, noise_w_scale=nw)), -1, 1)
        fr = frames(to16k(a)); sp = [(i, t) for i, t in enumerate(fr) if t not in ("<pad>", "|", "ʔ")]
        k = [j for j, (i, t) in enumerate(sp) if t == c]
        if not k: continue
        j = k[0]; ci = sp[j][0]; prev = sp[j - 1][0] if j > 0 else max(0, ci - 4)
        nxt = sp[j + 1][0] if j + 1 < len(sp) else len(fr)
        for end_mode in ("next", "end"):
            start = (prev + ci) / 2 if j > 0 else max(0, ci - 3)
            end = (ci + nxt) / 2 if (end_mode == "next" and j + 1 < len(sp)) else len(fr)
            seg = a[int(start * 0.02 * SR):int(min(len(a) / SR, end * 0.02 + 0.02) * SR)].copy()
            if len(seg) < SR * 0.05: continue
            f = min(int(SR * 0.012), len(seg) // 4); seg[:f] *= np.linspace(0, 1, f); seg[-f:] *= np.linspace(1, 0, f)
            src = wav_tmp(seg)
            for stretch in (1.0, 0.7, 0.55):
                with tempfile.NamedTemporaryFile(suffix=".mp3") as m:
                    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-af", f"atempo={stretch},adelay=80,apad=pad_dur=0.15,loudnorm=I=-16:TP=-1.5", "-ac", "1", "-ar", "24000", "-b:a", "64k", m.name], check=True)
                    if robuste(L, m.name):
                        subprocess.run(["cp", m.name, str(R / "audio" / "lettres" / f"son-{L}.mp3")], check=True)
                        print(L, "-> validé", ph, ls, ns, nw, end_mode, stretch, flush=True); done = True; break
            if done: break
        if done: break
    if not done: print(L, "-> ÉCHEC", flush=True)
