# Frostbound design and interaction audit

Date: 2026-09-23. Scope: the current checkout's solo and multiplayer game, title, HUD, menus, progression, help, and recovery states.

**Implementation integrity: coherent, with specific interaction gaps.** The live frozen cathedral, serif titles, restrained ivory/brass palette, and frosted play button form a recognizable game identity. Preserve these. The main weaknesses are undersized supporting text, hidden gameplay information, inconsistent focus handling, and a few multiplayer edge cases.

This pass combines two independent source assessments (design and technical), the parent's source review, automated checks, and the Impeccable detector. **Rendered verification was blocked:** development servers cannot bind a local port (`listen EPERM`), and Computer Use rejected opening Terminal. No desktop/mobile screenshots, synthesized touch gestures, screen-reader checks, or live multiplayer results are claimed.

## Health score before changes

These scores describe the inspected source before this patch; they are provisional rather than a WCAG or performance certification.

| Dimension | Score | Principal evidence |
| --- | ---: | --- |
| Accessibility | 2/4 | Named controls and accessible feature dialogs exist, but gameplay swallows Space on focused buttons; pause/results lack focus management; Settings loses its name at narrow widths. |
| Performance | 2/4 | Lazy world import and bounded scene geometry; repeated React snapshots continue in stationary states, and the renderer still runs beneath menus. |
| Responsive design | 2/4 | Portrait and landscape arrangements and pointer capture exist; a short-screen race rule forces a 340px HUD into a 320px viewport. Supporting typography is frequently 8–11px. |
| Theming | 2/4 | A coherent intentional dark environment, with partial shared tokens and substantial repeated color literals. A light theme is not required for this game. |
| Implementation integrity | 3/4 | Good product-specific architecture and menus, with inconsistent state/focus/return behavior across solo and multiplayer. |
| **Total** | **11/20** | **Significant work needed.** |

Do not assign a post-fix score until the changed screens have been exercised in a browser. The detector returned `[]` for the scanned title, solo game, HUD, race entry/game, and new run-summary dialog; this does not certify appearance or accessibility.

## Direction and design changes

Three approaches were considered: a centered arcade launcher that reduces navigation; a denser expedition dashboard that foregrounds records and goals; and refinement of the existing cinematic sidebar. The sidebar is the strongest fit: it keeps the playable cathedral visible, offers one dominant play action, and retains direct access to multiplayer, daily runs, and progression without introducing another navigation system.

Implemented:

- Raise supporting title/menu/lobby typography to a consistent 12px floor, with a limited 11px compact-screen control hint. Retain the established display lettering and frozen play button.
- Put movement, jump, and Enter instructions immediately beneath the play button. They remain visible on intermediate-width screens instead of disappearing with the old footer hint.
- Increase Change mode to a 44px target; preserve the Settings accessible name when its visible label is hidden.
- Remove menu-row padding animation so hovering does not move the label.
- Introduce shared readable text, border, HUD-surface, and momentum tokens. Keep the dark scene's visual identity.
- Make floor the dominant HUD numeral, give momentum an explicit visible label and thicker track, and increase guidance-dismiss targets to 44px. Use a more opaque HUD surface to stabilize contrast over the scene.
- Flatten the nested next-climb card into a divided section within the results, with larger supporting labels.
- Expose score submission/rankings directly below retry for non-Practice runs that reach a floor.

## Prioritized findings and disposition

16 findings: 4 P1, 10 P2, 2 P3. No P0 blocker was established in the source audit.

| Priority | Finding and user impact | Location | Disposition |
| --- | --- | --- | --- |
| P1 | Space on a focused Menu/audio button becomes a jump, preventing normal keyboard activation. WCAG 2.1.1 relevance. | `app/game.tsx` keyboard handler; `components/race-game.tsx` keyboard handler | Fixed: movement excludes interactive targets; unconditional release handling remains. |
| P1 | Pause and result overlays appear without deliberate focus placement. The visually covered game stays in the tab order. WCAG 2.4.3 relevance. | `app/game.tsx`; `components/run-summary-dialog.tsx`; race result heading | Fixed in source: solo uses Base UI modal focus containment, names/descriptions, heading focus, keyboard resume/retry, visible close control, and gameplay/title focus restoration. Secondary dialogs take focus independently, and graphics errors/reconnection suppress the summary so recovery controls remain reachable. Race focuses its result heading. Browser/screen-reader verification pending. |
| P1 | The Settings button has no accessible name at ≤370px because CSS hides its label and its icon is decorative. WCAG 4.1.2 relevance. | `components/title-menu.tsx` utilities; title stylesheet | Fixed with an independent `aria-label`. |
| P1 | Leaving for the title, daily, guided practice, or multiplayer silently replaces an unfinished solo climb. | `app/game.tsx` activity transitions | Fixed for these player-facing transitions: a confirmation preserves the paused run; cancellation restores the originating menu/help/daily panel. Saved records are retained. Browser flow verification pending. |
| P2 | On-screen movement/jump buttons only process pointer input, so Enter or assistive synthesized clicks do nothing. | `hooks/use-game-control-keys.ts`; solo/race control bindings | Fixed in source with independent keyboard holds, release on keyup/blur, virtual-click pulses, and cleanup on inactive/unmount. Pointer capture and simultaneous input sources remain intact. Shove now uses native click activation. Physical touch and assistive activation remain untested. |
| P2 | An explicit reduced-motion setting does not reach portaled solo dialogs. Race only samples preferences during initialization. | `app/game.tsx`; `app/menu-system.css`; race initialization | Solo portal behavior fixed through the effective document preference. Live race preference subscription remains a follow-up. |
| P2 | Race inputs can remain held after a visibility-only interruption because only blur is handled. | `components/race-game.tsx` input lifecycle | Fixed: hidden visibility, pagehide, and orientation changes clear input without stopping the shared race clock. |
| P2 | The short-height race HUD overflows 320px-wide screens. | `components/race-game.module.css` max-height rule | Fixed with `min(340px, calc(100% - 32px))`. Rendered bounds at 320×500 pending. |
| P2 | Repeated 8–11px metadata and supporting text make navigation hard to read, especially on phones. | Title, game-menu, race-entry, next-climb styles | Improved with a larger type floor and consistent muted text. Actual wrapping, 200% zoom, and translated/long strings need browser checks. |
| P2 | The central momentum mechanic looks like a decorative 2px border and is not visibly named. | `components/game-hud.tsx` and stylesheet | Fixed with a visible Momentum label, 4px track, and accessible explanatory name. |
| P2 | Competitive payoff is hidden behind Run details, which reads as a statistics destination. | Solo run summary | Fixed with a secondary score/rankings action, retaining retry as primary. Server submission was not exercised. |
| P2 | Stationary solo screens publish fresh React snapshots roughly every 65ms. | `app/game.tsx` animation loop | Removed unchanged periodic snapshots outside active play; events and every engine status transition still publish, including asynchronous AI failures. The world still renders ambient frames: GPU throttling/invalidation requires profiling and is deferred. |
| P2 | Readiness checks only the first rival, so a disconnected first guest can block another player's ready action despite a different connected rival. | `components/race-game.tsx` lobby readiness | Fixed: readiness availability considers every rival. Copy still explains that all participants must be connected/ready before the server starts the race. Server rules were not relaxed. |
| P2 | Repeated color literals and overlapping global overrides make consistency fragile. | `app/globals.css`, module styles, `app/menu-system.css` | Partially addressed with shared tokens in touched surfaces. Consolidation of the legacy stylesheet is deferred to avoid unrelated cascade changes without rendered verification. |
| P3 | Fullscreen silently does nothing when the browser API is absent. | Solo settings fullscreen action | Fixed: the unavailable-API path now displays the same explanatory toast as a rejected request. |
| P3 | Context-menu suppression uses device capability, so hybrid touch/mouse devices can lose mouse and keyboard context menus too. | `lib/game-touch.ts` | Deferred: separate actual touch origin from hardware capability, while retaining the prior requested protection against long-press selection. Requires hybrid-device checks. |

## Surface coverage

| Surface/state | Evidence in this pass |
| --- | --- |
| Title: loading/ready/failure, daily/friend context, records, utilities | Source inspection; changed labels, hint location, type, target size, Settings name. |
| Classic, Party, Practice gameplay | Source inspection; focused engine/input/guidance tests; revised HUD. No physics or scoring changes. |
| Pause, retry, result, activity exit | Source inspection and implementation review; focus/modal/confirmation changes. No live interaction proof. |
| Settings, help, daily selection, share routes | Source inspection; portal motion and fullscreen fallback fixes. Native fullscreen/share not exercised. |
| Goals, progress, wardrobe, rankings | Source inspection and neighboring design review; existing feature semantics retained. No score submission or external sharing. |
| Multiplayer join/host, profile, lobby, readiness, countdown, gameplay/results | Independent source review and focused race tests; input/lifecycle/readiness/HUD fixes. No two-client browser run. |
| Touch, keyboard, zoom, reduced motion | Code and unit evidence only. Physical device, synthesized touch, focus traversal, zoom, and assistive technology checks remain pending. |
| WebGL loading/recovery and analytics | Source review; existing graphics recovery and local analytics boundaries retained. No production service writes. |

## Verification and practical limits

- TypeScript and type-aware lint pass after the final corrections. `git diff --check` is clean. A bounded independent source review caught and corrected summary-modal interference with graphics recovery and a missing asynchronous pause update before handoff.
- 94 distinct focused tests pass across engine/input, first-jump guidance, next-climb suggestions, solo analytics, race clients/lobbies, race simulation, hazards, Party rules, graphics recovery, and AI-player failure handling (41 solo cases, 42 race/input cases with four shared input cases, and 15 recovery/AI cases). These tests validate simulation and protocol behavior; they do not substitute for exercising the new browser focus and control handlers.
- Impeccable detector: zero findings on six scanned game surfaces, run once. Its scan does not cover the renderer, all legacy CSS, or unvisited browser states.
- Calculated static palette contrast: menu muted text 7.68:1, menu main text 11.76:1, menu gold 7.14:1 against `#192f39`; floor-label text 10.60:1 against the HUD base; play-button text 7.85:1 against its base. These are base-color calculations, not measured contrast across moving pixels.
- All five Netlify build compilation stages pass. **The full build does not pass:** static prerendering attempts to open a loopback server and fails with `listen EPERM` in this session.
- The largest emitted client chunk is approximately 600 KiB minified / 151 KiB gzip. The build still emits its >500kB advisory. Do not infer load time or frame rate from file size alone.
- Development preview is blocked by the same local-port restriction. Computer Use also rejected opening Terminal. There are no visual captures for this pass.

## Keep

The real 3D cathedral and original character; the frosted primary action; direct title destinations; Join/Host separation and actionable empty lobby; labeled settings; progressive first-jump guidance; individual input-source ownership; cancellation/lost-capture handling; local personal records; accessible existing feature dialogs; and bounded scene pools.

## Next validation pass

1. Run `DEPLOY_TARGET=netlify npm run dev -- --port 5188 --hostname 127.0.0.1` outside this restricted command runner.
2. Inspect desktop 1440×900, portrait 390×844 and 320×568, landscape 844×390, and a 320×500 race HUD. Include 200% browser zoom.
3. Keyboard: play, Tab to Menu and use Space, resume with Escape/P/Enter, open and close Settings, finish a run, use rankings, cancel/confirm an activity change. Verify visible focus and no background tab stops.
4. Touch: hold direction + jump simultaneously, slide direction, cancel capture, rotate, background/return. Test virtual clicks and keyboard holds on the named control buttons.
5. Two-client race: join, readiness, a disconnected rival, countdown, controls/shove, results, rematch. Add a third client for the disconnected-first-rival case.
6. Turn on Reduce motion with OS reduction off and open every portaled menu. Test race OS preference changes separately; live subscription remains outstanding.
7. Complete `npm run build:netlify` outside the restricted environment. Profile ambient menu/paused rendering before attempting GPU optimizations.

Use `$impeccable adapt` for any verified layout/input defects, `$impeccable harden` for remaining lifecycle/accessibility defects, and `$impeccable optimize` for measured rendering cost. Finish with one bounded `$impeccable polish` pass after those checks.
