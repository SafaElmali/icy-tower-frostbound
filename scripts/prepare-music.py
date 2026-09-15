"""Usage: python3 scripts/prepare-music.py /path/to/blackdiamond.ogg

Requires FFmpeg. Source and license details: public/audio/ATTRIBUTION.md.
"""

import hashlib
import json
from pathlib import Path
import subprocess
import sys

source = Path(sys.argv[1])
output = Path(__file__).resolve().parent.parent / "public" / "audio"
target = output / "black-diamond.mp3"
subprocess.run([
    "ffmpeg", "-y", "-v", "error", "-i", str(source),
    "-af", "loudnorm=I=-18:TP=-2:LRA=11", "-ar", "44100", "-ac", "2",
    "-c:a", "libmp3lame", "-b:a", "128k", "-map_metadata", "-1",
    "-metadata", "title=Black Diamond", "-metadata", "artist=Joth",
    str(target),
], check=True)
info = json.loads(subprocess.check_output([
    "ffprobe", "-v", "error", "-show_entries", "format=duration,size",
    "-of", "json", str(target),
]))["format"]
metadata = {
    "title": "Black Diamond", "artist": "Joth", "bpm": 143,
    "license": "CC0-1.0",
    "source": "https://opengameart.org/content/black-diamond",
    "originalDownload": "https://opengameart.org/sites/default/files/Black%20Diamond.mp3",
    "downloadedFrom": "https://raw.githubusercontent.com/kelvinshadewing/supertux-advance/main/res/mus/blackdiamond.ogg",
    "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "file": target.name, "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
    "duration": float(info["duration"]), "bytes": int(info["size"]),
    "processing": "Full track; loudness normalized to -18 LUFS / -2 dBTP; 44.1 kHz stereo MP3 at 128 kbps",
}
(output / "music.json").write_text(json.dumps(metadata, indent=2) + "\n")
print(f"Prepared {metadata['title']}: {metadata['duration']:.2f}s, {metadata['bytes'] / 1024 / 1024:.2f} MiB")
