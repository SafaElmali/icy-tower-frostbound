"""Prepare the CC0 audio sources listed in public/audio/ATTRIBUTION.md.

Usage: python3 scripts/prepare-audio.py /path/to/extracted/source-packs
Requires ffmpeg. Outputs short mono PCM WAVs, a few longer ambient MP3s and a
seamless MP3 wind loop. The chime instrument, spring and thunder rumble are
synthesized here, so they need no source files.
"""

import array
import hashlib
import json
import math
import random
from pathlib import Path
import subprocess
import sys
import wave

SOURCE = Path(sys.argv[1])
OUTPUT = Path(__file__).resolve().parent.parent / "public" / "audio"
RATE = 24000
OUTPUT.mkdir(parents=True, exist_ok=True)
provenance = {}


def read(name, speed=1, af=None):
    path = SOURCE / name
    raw = subprocess.check_output([
        "ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(RATE),
        *(["-af", af] if af else []), "-f", "f32le", "-",
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


def save(name, layers, duration, synth=(), tail=0.035, mp3=False, note=None):
    """Mix source layers (file, gain, speed, delay[, ffmpeg filter]) and authored
    synth layers (label, samples, gain, delay) into one peak-balanced clip."""
    result = [0.0] * int(duration * RATE)
    inputs = []
    for source, gain, speed, delay, *rest in layers:
        af = rest[0] if rest else None
        samples = read(source, speed, af)
        offset = int(delay * RATE)
        for i, value in enumerate(samples[:len(result) - offset]):
            result[i + offset] += value * gain
        entry = {"file": source, "gain": gain, "speed": speed, "delay": delay,
                 "sha256": hashlib.sha256((SOURCE / source).read_bytes()).hexdigest()}
        if af:
            entry["filter"] = af
        inputs.append(entry)
    for label, samples, gain, delay in synth:
        offset = int(delay * RATE)
        for i, value in enumerate(samples[:len(result) - offset]):
            result[i + offset] += value * gain
        inputs.append({"synthesized": label, "gain": gain, "delay": delay})
    # Remove DC, soften the first millisecond and taper the tail to avoid clicks.
    mean = sum(result) / len(result)
    result = [(value - mean) * min(1, i / (RATE * 0.001)) *
              min(1, (len(result) - 1 - i) / (RATE * tail))
              for i, value in enumerate(result)]
    peak = max(abs(x) for x in result)
    record = {"duration": duration, "sources": inputs}
    if note:
        record["processing"] = note
    if mp3:
        # Ambient, timing-tolerant cues only: MP3 encoder delay adds a few ms of lead-in.
        pcm = array.array("f", (x / max(peak, 0.001) * 0.72 for x in result))
        if sys.byteorder != "little":
            pcm.byteswap()
        subprocess.run([
            "ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(RATE), "-ac", "1",
            "-i", "-", "-c:a", "libmp3lame", "-b:a", "64k", "-map_metadata", "-1",
            str(OUTPUT / f"{name}.mp3"),
        ], input=pcm.tobytes(), check=True)
        provenance[f"{name}.mp3"] = record
        return
    pcm = array.array("h", (round(x / max(peak, 0.001) * 0.72 * 32767) for x in result))
    if sys.byteorder != "little":
        pcm.byteswap()
    with wave.open(str(OUTPUT / f"{name}.wav"), "wb") as target:
        target.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        target.writeframes(pcm.tobytes())
    provenance[f"{name}.wav"] = record


def chime(frequency, duration):
    """A celesta-like struck steel bar: inharmonic partials that decay at different
    rates, a slow shimmer from a detuned fundamental, and a soft mallet tick."""
    partials = [(1, 1.0, 1.1), (1.0035, 0.35, 0.9), (2.0, 0.16, 0.45),
                (2.76, 0.2, 0.28), (5.4, 0.07, 0.12), (8.93, 0.035, 0.06)]
    noise = random.Random(int(frequency))
    out = []
    for i in range(int(duration * RATE)):
        t = i / RATE
        value = sum(gain * math.exp(-t / decay) * math.sin(2 * math.pi * frequency * ratio * t)
                    for ratio, gain, decay in partials)
        if t < 0.004:
            value += (noise.random() * 2 - 1) * 0.25 * (1 - t / 0.004)
        out.append(value * min(1, t / 0.0015))
    return out


def boing(duration):
    """A cartoon spring: a rising, wobbling tone with a quick metallic buzz."""
    out, phase = [], 0.0
    for i in range(int(duration * RATE)):
        t = i / RATE
        frequency = 190 * (560 / 190) ** min(1, t / 0.22) * (1 + 0.06 * math.sin(2 * math.pi * 17 * t) * math.exp(-t / 0.2))
        phase += 2 * math.pi * frequency / RATE
        out.append((math.sin(phase) + 0.3 * math.sin(2 * phase) + 0.12 * math.sin(3 * phase)) *
                   math.exp(-t / 0.16) * min(1, t / 0.004))
    return out


def rumble(duration, seed):
    """Low rolling thunder tail: smoothed noise with slow, uneven swells."""
    noise, out, low, lower = random.Random(seed), [], 0.0, 0.0
    for i in range(int(duration * RATE)):
        t = i / RATE
        low += ((noise.random() * 2 - 1) - low) * 0.035
        lower += (low - lower) * 0.08
        swell = 0.55 + 0.45 * math.sin(2 * math.pi * 1.3 * t + seed) * math.sin(2 * math.pi * 0.47 * t)
        out.append(lower * 9 * swell * math.exp(-t / (duration * 0.42)) * min(1, t / 0.12))
    return out


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

# Thin ice: a creaking crack when armed, two rising creaks while it gives way,
# then a glassy break with stone and a heavy thud underneath.
save("crumble", [("ice-spells/ice.wav", 1, 1.25, 0),
                 (rpg("creak1"), 0.55, 1.45, 0.01),
                 (impact("impactMining_000"), 0.35, 1.3, 0)], 0.40)
save("crumble-creak-1", [(rpg("creak2"), 1, 1.5, 0),
                         ("ice-spells/ice.wav", 0.28, 1.9, 0.03)], 0.32)
save("crumble-creak-2", [(rpg("creak3"), 1, 1.8, 0),
                         (impact("impactGlass_light_004"), 0.3, 1.45, 0.02),
                         ("ice-spells/ice.wav", 0.35, 2.2, 0.04)], 0.30)
save("collapse", [(impact("impactGlass_heavy_000"), 1, 0.95, 0),
                  ("ice-spells/coldsnap.wav", 0.55, 0.85, 0.01),
                  (impact("impactMining_002"), 0.45, 0.8, 0.02),
                  (impact("impactSoft_heavy_000"), 0.6, 0.8, 0)], 0.85)
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


def interface(name):
    return f"interface-sounds/Audio/{name}.ogg"


def scifi(name):
    return f"sci-fi-sounds/Audio/{name}.ogg"


# Icicles breaking on a ledge, in two variants.
save("icicle-shatter-1", [(impact("impactGlass_medium_001"), 1, 1.15, 0),
                          ("ice-spells/ice.wav", 0.4, 1.6, 0.01)], 0.36)
save("icicle-shatter-2", [(impact("impactGlass_medium_003"), 1, 1.25, 0),
                          (impact("impactGlass_light_002"), 0.45, 1.1, 0.03)], 0.36)
# The frost wraith: a hollow hum as it arrives, a tensing drone under the synth
# wail of its tell, and a cold, low whoosh for the dash.
save("wraith", [(scifi("forceField_001"), 1, 0.55, 0, "lowpass=f=1800"),
                ("ice-spells/coldsnap.wav", 0.25, 0.6, 0.05)], 0.80, tail=0.2, mp3=True)
save("wraith-tell", [(scifi("forceField_003"), 1, 0.8, 0, "lowpass=f=2600"),
                     ("ice-spells/ice.wav", 0.2, 0.7, 0.1)], 0.90, tail=0.15, mp3=True)
save("wraith-dash", [(rpg("knifeSlice2"), 1, 0.62, 0),
                     (rpg("drawKnife2"), 0.55, 0.7, 0.02),
                     (scifi("laserLarge_002"), 0.3, 0.5, 0, "lowpass=f=2500")], 0.45)
# Chime instrument: one struck note per register; the game plays melodies by
# changing playback rate, so every combo, crystal and frenzy note shares a timbre.
save("chime-high", [], 0.85, synth=[("chime A5 880 Hz", chime(880, 0.85), 1, 0)], tail=0.25,
     note="Authored in this script: celesta-like additive synthesis at 880 Hz")
save("chime-low", [], 1.05, synth=[("chime A3 220 Hz", chime(220, 1.05), 1, 0)], tail=0.3,
     note="Authored in this script: celesta-like additive synthesis at 220 Hz")
save("spring", [(interface("maximize_006"), 0.35, 1, 0)], 0.36,
     synth=[("rising spring boing", boing(0.36), 0.9, 0)])
# Ambience: thunder answers Stormcrown lightning; a distant bell tolls in the Belfry.
for i, (blast, crunch) in enumerate([("lowFrequency_explosion_000", "explosionCrunch_001"),
                                     ("lowFrequency_explosion_001", "explosionCrunch_003")]):
    save(f"thunder-{i + 1}", [(scifi(blast), 1, 0.55, 0.05, "lowpass=f=1100"),
                              (scifi(crunch), 0.45, 0.45, 0, "lowpass=f=700")],
         2.6, synth=[("thunder rumble", rumble(2.6, i + 3), 0.8, 0.15)], tail=0.6, mp3=True)
save("bell-toll", [(impact("impactBell_heavy_001"), 1, 0.5, 0,
                    "lowpass=f=2800,aecho=0.8:0.6:140|310:0.35|0.22")], 3.2, tail=0.8, mp3=True)

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
