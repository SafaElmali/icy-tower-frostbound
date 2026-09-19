# Menu UX audit and premium design pass

Reviewed 19 September 2026 against this checkout. The audit uses the rendered local game and the production UI source, including conditional states. This is a heuristic and implementation audit, not a human usability study.

## Design decision

Three directions were considered: a controller-style tile grid, a character-focused lobby, and cinematic sidebar navigation. The sidebar best supports this game's fast solo retry loop and live cathedral environment. The implementation uses restrained ivory and brass accents, editorial typography, fine dividers, minimal corner rounding, and brief entrance/hover transitions. It adds no image downloads or animation libraries. Multiplayer reuses the existing wardrobe preview on desktop; the preview is not mounted on narrow screens or behind the profile editor.

Desktop preserves the cathedral beside navigation. Portrait becomes one readable column. Short landscape places navigation beside the title so essential destinations and utilities remain visible.

## Findings addressed

| Priority | Finding                                                                                             | Implemented improvement                                                                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | Multiplayer, outfits, goals, and rankings were hidden behind a title action named Game modes.       | Direct title destinations for multiplayer, daily towers, progress, outfits, rankings, and help. Change mode now accurately names the solo selector.                                                             |
| High     | Selecting a mode required closing with Done and then finding Play on the title.                     | Mode selection has a contextual Play Classic / Party / Practice action that launches directly. Daily and challenge contexts retain their own launch labels.                                                     |
| High     | Closing Outfits, Goals, Help, or Rankings opened from the hub discarded the parent menu.            | Feature dialogs return to the originating hub tab; launching a run clears that return context.                                                                                                                  |
| High     | The title's personal-best line could fall below a small, independently scrolling navigation region. | A dedicated footer displays the current mode's record; the entire title layout can scroll when necessary. Short landscape has a separate two-column composition.                                                |
| Medium   | The progress hub was only a list of links.                                                          | It now shows the actual personal best and completed milestone count; the title includes the real next goal or completion state.                                                                                 |
| Medium   | Pause offered little navigation and a generic Continue action.                                      | A distinct pause panel with Resume climb, Settings, How to play, and Back to title. Settings can resume the run directly.                                                                                       |
| Medium   | Dialogs varied in border, corner, close-button, and title treatment.                                | Shared panel/overlay styling, 44px close controls, consistent typography and accents across the hub, wardrobe, rankings, daily/share panels, help, goals, and results. Multiplayer uses the same visual family. |
| Medium   | Three narrow mode cards made descriptions difficult to read on phones.                              | Cards become full-width rows on phones, retaining selected state and the mode's meaningful gameplay differences.                                                                                                |
| Medium   | Global Enter handling could start solo gameplay while a navigation link was focused.                | Native links, buttons, summary controls, and tabs keep their own keyboard activation.                                                                                                                           |
| Low      | Daily contexts used generic challenge copy, and menu footer text could misidentify its destination. | Daily-specific guidance and contextual return/launch labels, including Back to results.                                                                                                                         |

## Surface inventory and review coverage

| Surface                                                                                            | Coverage                                                                                                                           |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Title: loading, ready, modes, record, utilities                                                    | Source plus rendered desktop, portrait, and landscape review. Existing saved records were retained.                                |
| Daily/friend invitation title variants and invalid links                                           | Source reviewed; launch/context rendering retained.                                                                                |
| Play hub: Classic, Party, Practice, multiplayer, daily, guided practice, help                      | Rendered review, native radio selection, direct Practice launch.                                                                   |
| Progress hub: goals, outfits, leaderboard, ghost                                                   | Rendered review; actual record and goal totals; wardrobe round trip verified.                                                      |
| Settings: sound, music, reduced motion, quality, fullscreen                                        | Rendered desktop/phone/landscape review; settings-to-game resume verified. Browser fullscreen permission behavior was not changed. |
| Pause                                                                                              | Rendered phone review; Escape pause, Settings, Resume, and return to title exercised.                                              |
| End-of-run summary and run details                                                                 | Source review and shared presentation update. No new scoring or result logic.                                                      |
| Goals: available, locked, completed, extra challenges                                              | Source review; completed state inspected. Underlying progression tests pass.                                                       |
| Wardrobe: equipped, unlocked, locked, browser storage note                                         | Rendered equipped/unlocked state and return navigation; locked/storage-failure states source reviewed.                             |
| How to play and full gameplay guide                                                                | Source and rendered help-panel review; existing mechanics and progressive disclosure retained.                                     |
| Daily selection and dated tower sharing                                                            | Source and selection-panel review. No links sent to other people.                                                                  |
| Rankings: loading, error, empty, submission, success                                               | Source review. Local dev does not implement the deployed Netlify leaderboard endpoint; live submission was not exercised.          |
| Friend challenge sharing: native share, copy, fallback                                             | Source review; no external share performed.                                                                                        |
| Multiplayer directory, identity, customization, public/private hosting                             | Rebuilt with Join / Host tabs, compact profile, separate identity editor, and actionable empty state. Phone/desktop, keyboard, private hosting and invitation joining exercised.                                                                    |
| Multiplayer waiting room, host rules, guest view, readiness, countdown, result/rematch, disconnect | Source review; visual family updated. Two clients joined a private lobby and readiness unlocked. Countdown, a full race, and rematch were not exercised.                                          |
| Playtest measurements and development-only Jev inspector                                           | Source/inventory review. These retain their specialist interfaces. Jev remains development-only.                                   |

## Remaining improvements, in recommended order

1. **Protect paused runs when changing activities.** Guided practice, a daily launch, or leaving for multiplayer can replace an active solo run. Add a consistent in-game “Leave this climb?” flow, preserving the originating panel on cancel.
2. **Make competitive results more immediate.** Submission and friend challenges remain inside Run details. Test a compact secondary action for eligible finished runs without weakening the retry button.
3. **Unify all nested return paths.** The main feature-to-hub routes now work; daily sharing and result-to-sharing navigation would benefit from a small explicit navigation stack.
4. **Complete accessibility validation.** Check screen-reader announcements, pause/result focus management, 200% zoom, contrast over the moving scene, and reduced-motion preferences on physical devices. Keyboard navigation was exercised, but this is not a WCAG certification.
5. **Add gamepad navigation only as a real supported input mode.** Directional focus, confirm/back, input-specific prompts, and controller testing should ship together; decorative controller hints would be misleading today.
6. **Validate the design with first-time players.** Observe starting a solo run, finding multiplayer, changing outfits, and resuming a paused climb. Measure completion and wrong turns before claiming retention or conversion improvements.

## Verification

- TypeScript and lint pass.
- Production Netlify build passes; the bundler reports its large-chunk advisory.
- 24 focused tests pass across input/pause behavior, skill goals, guided onboarding, and race profiles.
- Visual checks include 1440×900, 1280×720, 390×844, and 844×390.
- The initial menu pass did not change gameplay rules, saved-record schemas, public scores, or deployment settings. Subsequent requested gameplay changes are listed below.

## Multiplayer directory follow-up

The annotated 637×843 screen put a long profile/hosting form before room discovery. Three compositions were considered: a single compact form, a full-screen activity carousel, and a character sidebar with Join / Host tabs. The sidebar and tabs make the two player intentions explicit, retain character identity on desktop, and collapse into a compact profile strip on phones.

The default view now shows open lobbies immediately. An empty directory links directly to hosting. Public/private choices explain discoverability, the primary button names the selected action, and invited players receive a dedicated join screen. Identity editing uses the existing accessible dialog and profile controls. This directory redesign retained the existing networking and race rules.

Follow-up verification: lint, TypeScript, Netlify build, and 17 focused race lobby/profile/client tests pass. Browser checks cover 1280×900, the annotated 637×843 viewport, and 390×844; profile editing, keyboard tab navigation, private hosting, invitation joining with a second client, and leaving the test lobby were exercised.

## Additional requested changes

- Restored the frozen edge, layered frost, and blue glow on the main play button.
- Added host-selectable Classic / Party multiplayer rules. Party uses existing low gravity, springs, and crystal double jumps in the shared client/server simulation. Mode changes reset readiness; listings, countdown, HUD, results, and rematches retain the selected mode. Race protocol and recording versions were advanced, so pre-update rooms must be recreated. Two browser clients exercised mode changes, readiness reset, countdown, and live Party gameplay; automated tests cover replay verification and rematches.
- Removed the separate Frenzy ring, retaining the existing icy recovery shield and crystal trail. The recovery shield now follows the approved image concept using one faceted, transparent ice mesh, procedural edge frost, and four drifting ice shards. The same effect serves the local climber and multiplayer rivals, with no detached outline or orbit. Original character assets and protection timing are retained.
- Disabled touch selection and native callouts on game surfaces and menus while preserving editable name and invite fields. Mobile emulation confirmed nonselectable menu text and selectable input text; physical-device Safari validation remains outstanding.
