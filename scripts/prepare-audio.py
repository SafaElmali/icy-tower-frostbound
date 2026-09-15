"""Prepare the CC0 audio sources listed in public/audio/ATTRIBUTION.md.

Usage: python3 scripts/prepare-audio.py /path/to/extracted/source-packs
Requires ffmpeg. Outputs short mono PCM WAVs and a seamless MP3 wind loop.
"""

import array
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import wave

SOURCE = Path(sys.argv[1])
OUTPUT = Path(__file__).resolve().parent.parent / "public" / "audio"
RATE = 24000
OUTPUT.mkdir(parents=True, exist_ok=True)
provenance = {}


def read(name, speed=1):
    path = SOURCE / name
    raw = subprocess.check_output([
        "ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(RATE),
        "-f", "f32le", "-",
    ])
    samples = array.array("f", raw)
    if sys.byteorder != "little":
        samples.byteswap()
    # Preserve a 2 ms lead-in; remove only the silence before the first attack.
    threshold = max(abs(x) for x in samples) * 0.025
    start = next((i for i, x in enumerate(samples) if abs(x) > threshold), 0)
    samples = samples[max(0, start - int(RATE * 0.002)):]
    if speed != 1:
        samples = [samples[min(int(i * speed), len(samples) - 1)]
                   for i in range(int(len(samples) / speed))]
    return samples


def save(name, layers, duration):
    result = [0.0] * int(duration * RATE)
    inputs = []
    for source, gain, speed, delay in layers:
        samples = read(source, speed)
        offset = int(delay * RATE)
        for i, value in enumerate(samples[:len(result) - offset]):
            result[i + offset] += value * gain
        inputs.append({"file": source, "gain": gain, "speed": speed, "delay": delay,
                       "sha256": hashlib.sha256((SOURCE / source).read_bytes()).hexdigest()})
    # Remove DC, soften the first millisecond and taper the tail to avoid clicks.
    mean = sum(result) / len(result)
    result = [(value - mean) * min(1, i / (RATE * 0.001)) *
              min(1, (len(result) - 1 - i) / (RATE * 0.035))
              for i, value in enumerate(result)]
    peak = max(abs(x) for x in result)
    pcm = array.array("h", (round(x / max(peak, 0.001) * 0.72 * 32767) for x in result))
    if sys.byteorder != "little":
        pcm.byteswap()
    with wave.open(str(OUTPUT / f"{name}.wav"), "wb") as target:
        target.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        target.writeframes(pcm.tobytes())
    provenance[f"{name}.wav"] = {"duration": duration, "sources": inputs}


def impact(name):
    return f"impact-sounds/Audio/{name}.ogg"


def rpg(name):
    return f"rpg-audio/Audio/{name}.ogg"


def digital(name):
    return f"digital-audio/Audio/{name}.ogg"


for i in range(3):
    save(f"jump-{i + 1}", [(rpg(f"cloth{i + 2}"), 0.65, 1.5, 0),
                          (digital("phaseJump1"), 0.16, 1.45 + i * 0.035, 0)], 0.30)
    save(f"land-{i + 1}", [(impact(f"footstep_snow_00{i}"), 1, 1.15, 0),
                          (impact(f"footstep_concrete_00{i}"), 0.35, 0.95, 0)], 0.30)
    save(f"gem-{i + 1}", [(impact(f"impactGlass_light_00{i}"), 1, 1.3, 0)], 0.18)

for i in range(2):
    save(f"wall-{i + 1}", [(impact(f"impactPunch_medium_00{i}"), 0.8, 1.25, 0),
                          (rpg("cloth3"), 0.3, 1.8, 0.025)], 0.25)

save("crumble", [("ice-spells/ice.wav", 1, 1.35, 0)], 0.24)
save("collapse", [("ice-spells/coldsnap.wav", 1, 0.9, 0),
                  (impact("impactSoft_heavy_000"), 0.5, 0.85, 0)], 0.65)
save("hurt", [(impact("impactPunch_heavy_000"), 1, 1.2, 0),
              ("ice-spells/ice.wav", 0.3, 1.5, 0)], 0.36)
save("stomp", [(impact("impactPunch_medium_002"), 1, 1.4, 0)], 0.24)
save("dodge", [(rpg("knifeSlice"), 1, 1.7, 0)], 0.25)
save("bat-warning", [(rpg("bookFlip3"), 1, 1.7, 0),
                     (rpg("bookFlip3"), 0.7, 1.9, 0.105),
                     (rpg("bookFlip3"), 0.45, 2, 0.21)], 0.35)
save("icicle-warning", [("ice-spells/coldsnap.wav", 1, 1.8, 0)], 0.16)
save("frenzy", [(digital("highUp"), 1, 1.15, 0)], 0.48)
save("frenzy-end", [(digital("highDown"), 1, 1.1, 0)], 0.48)
save("encounter", [("ice-spells/coldsnap.wav", 1, 0.7, 0)], 0.60)
save("over", [(digital("lowDown"), 1, 0.9, 0)], 0.90)

# Make the last second crossfade into the first; no silent gap at the loop seam.
wind_source = "icy-heights/wind.ogg"
wind = read(wind_source)
overlap = RATE
middle = list(wind[overlap:-overlap])
crossfade = [wind[-overlap + i] * math.cos(i / overlap * math.pi / 2) +
             wind[i] * math.sin(i / overlap * math.pi / 2) for i in range(overlap)]
wind = middle + crossfade
wind_peak = max(abs(x) for x in wind)
wind_pcm = array.array("f", (x / wind_peak * 0.55 for x in wind))
if sys.byteorder != "little":
    wind_pcm.byteswap()
subprocess.run([
    "ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(RATE), "-ac", "1",
    "-i", "-", "-c:a", "libmp3lame", "-b:a", "64k", "-map_metadata", "-1",
    str(OUTPUT / "wind-loop.mp3"),
], input=wind_pcm.tobytes(), check=True)
provenance["wind-loop.mp3"] = {"sources": [{"file": wind_source,
    "sha256": hashlib.sha256((SOURCE / wind_source).read_bytes()).hexdigest()}],
    "processing": "Mono 24 kHz, peak 0.55, 1-second equal-power seam crossfade, MP3 64 kbps"}
(OUTPUT / "sources.json").write_text(json.dumps(provenance, indent=2) + "\n")
total = sum((OUTPUT / name).stat().st_size for name in provenance)
print(f"Prepared {len(provenance)} clips ({total / 1024:.0f} KiB) in {OUTPUT}")
