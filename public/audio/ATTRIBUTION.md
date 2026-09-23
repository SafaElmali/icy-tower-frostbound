# Frostbound audio

The imported recordings below are offered under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) by their source pages, checked on September 15, 2026. Thank you to their creators. Audio ships with the game; playback never contacts these sites.

| Creator / pack | Source | Used for |
| --- | --- | --- |
| Kenney — Impact Sounds | https://kenney.nl/assets/impact-sounds | Snow and concrete landings, wall impacts, glass pickup textures, hurt and stomp impacts, breaking thin ice and icicles, the Belfry bell |
| Kenney — RPG Audio | https://kenney.nl/assets/rpg-audio | Cloth jump whooshes, wall movement, knife-swish dodges and the wraith dash, book-flip bat flutters, creaking thin ice |
| Kenney — Digital Audio | https://kenney.nl/assets/digital-audio | Jump accents, frenzy activation / ending, game-over descent |
| Kenney — Interface Sounds | https://kenney.nl/assets/interface-sounds | Spring platform accent |
| Kenney — Sci-Fi Sounds | https://kenney.nl/assets/sci-fi-sounds | Frost wraith hum and tell, dash accent, thunder blasts |
| bart — Ice spells, using Stephan's recording from pdsounds | https://opengameart.org/content/ice-spells | Crumbling platforms, collapse, icicle warning, encounter and hurt textures |
| Écrivain — Icy Heights (`wind.ogg`) | https://opengameart.org/content/icy-heights | Tower wind loop |
| Joth — Black Diamond | https://opengameart.org/content/black-diamond | Looping 143 BPM background music |

The WAVs are edited mixes, not untouched source recordings: silence trimmed, pitch / speed adjusted, layers mixed, DC removed, tails faded, and peaks balanced to 0.72. The wind is converted to mono with a one-second crossfade at the loop boundary and encoded as MP3. `sources.json` records each source filename, SHA-256 and layer settings. Kenney's original license notices are retained in `licenses/`.

The chime instrument (`chime-low.wav`, `chime-high.wav`), the spring boing and the thunder rumble tail are synthesized by `scripts/prepare-audio.py` itself, so they have no external source. `lib/tower-audio.ts` plays the combo melodies, crystal overtones, frenzy rhythm and "combo ended" notes on that chime by changing its playback rate, keeping every musical cue in one timbre and in sync with game events. Its oscillator synthesis remains the fallback while samples load. Cues are panned across the tower by where they happen, landings rise slightly in pitch as a combo grows, thunder answers Stormcrown lightning, and a distant bell tolls now and then in the Frozen Belfry.

## Rebuild

Download and extract each pack into a source directory with these subfolders:

- `impact-sounds/Audio/` — [official ZIP](https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip)
- `rpg-audio/Audio/` — [official ZIP](https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip)
- `digital-audio/Audio/` — [official ZIP](https://kenney.nl/media/pages/assets/digital-audio/216eac4753-1677590265/kenney_digital-audio.zip)
- `ice-spells/` — [official ZIP](https://opengameart.org/sites/default/files/icespells.zip)
- `icy-heights/wind.ogg` — [original wind](https://opengameart.org/sites/default/files/wind.ogg)
- `interface-sounds/Audio/` — [official ZIP](https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip)
- `sci-fi-sounds/Audio/` — [official ZIP](https://kenney.nl/media/pages/assets/sci-fi-sounds/6b296f9ecf-1677589334/kenney_sci-fi-sounds.zip)

Run `python3 scripts/prepare-audio.py /path/to/source-directory` with FFmpeg installed. Python uses only its standard library. The output is 30 short 24 kHz mono PCM WAVs, five longer ambient MP3s (wraith hum and tell, two thunder rolls, the Belfry bell) and one wind MP3, approximately 1,045 KiB in total. Timing-sensitive cues stay WAV because MP3 adds a few milliseconds of encoder delay.

To replace a sound later, keep its filename or update `lib/tower-samples.ts`, balance its peak to the other samples, and update these credits and `sources.json`. Each movement cue rotates through its available variants. Missing or undecodable files fall back to synthesis without delaying gameplay.

## Background music

**Black Diamond** by **Joth** is a 143 BPM drum-and-bass loop composed for icy racing levels. The [creator's source page](https://opengameart.org/content/black-diamond) offers it under CC0, with credit appreciated but optional.

The download used here is the OGG copy bundled with [SuperTux Advance](https://github.com/kelvinshadewing/supertux-advance/blob/main/res/mus/blackdiamond.ogg); Joth's source page links that game's use of the track. The original OpenGameArt download was timing out. `music.json` records both URLs, the source hash, output hash, duration, and conversion settings.

Rebuild with `python3 scripts/prepare-music.py /path/to/blackdiamond.ogg`. This preserves the full track and converts it to 44.1 kHz stereo MP3 at 128 kbps, with -18 LUFS / -2 dBTP loudness targets. It is separate from the sound-effect manifest so rebuilding effects does not replace the soundtrack metadata.

The game streams the local MP3 through its audio mixer. Music loops at a low level, pauses with gameplay, resumes from the same position, and briefly dips beneath hazard/reward cues. **Menu → Settings → Background music** controls it independently; **Sound** mutes all audio. The race header also provides a music toggle. No music service or external playback request is required.
