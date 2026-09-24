# Lessons for the next game

Frostbound passed a web game portal's technical review, but its soft launch failed in September 2026. This page records what the numbers showed and what to do differently next time.

## What happened

The portal ran a soft launch with real players for about eight days. It then compared engagement against other games in the same category. Technical quality was not the problem:

| Check | Frostbound |
| --- | --- |
| Average load time | 3.2 s |
| Load / gameplay crash rate | 0.6% / 1.4% |
| Player rating | 8.1 / 10 (67 votes) |

Engagement was in the category's bottom 20%:

| Metric | Frostbound | Strong games |
| --- | --- | --- |
| Gameplay conversion (players reaching about a minute of play) | 39% (desktop 58%, mobile 24%) | 80%+ |
| Average playtime | 2 min 18 s | 10+ min |
| Next-day (D1) retention | 1.4% | 10–15% |
| Returning users | 2.8% | — |

The "strong games" values are the portal's published guidance, not exact pass marks.

Our PostHog data from 16–24 September explains most of it:

- 78% of players started a run, so the menu was not the main blocker.
- The median finished run lasted 23 seconds and ended around floor 12.
- 40% of players who started a run never played a second one.
- Only a third reached one minute of active climbing; 14% reached two minutes.
- About two-thirds of recorded first-run deaths were falls.

The players who stayed rated the game well, but a good rating could not make up for everyone who left in the first minute.

## 1. Design the first five minutes first

- A new player's first run should last at least a minute. Hold back pressure until the player has shown they can move and jump; Frostbound's rising frost started at floor 5.
- Make the first death teach something, and make retrying a single input.
- Give the next few runs a visible, reachable goal so a short run still feels like progress.
- Before submitting, watch new players and measure time to first death, voluntary second runs and total active time after five minutes.

## 2. Give players a reason to return tomorrow

D1 retention was 1.4% even with a daily tower, unlockable outfits and leaderboards. Players ignore features that don't show up at the right moment.

- End every session with a concrete hook for the next day on the results screen, such as tomorrow's tower, a streak or an unlock one session away.
- Show persistent progress on the first screen a returning player sees.
- Measure D1 retention in our own analytics before submitting.

## 3. Plan sessions that last ten minutes

- Short runs only work if players chain many of them. Players who started averaged three to four runs, and average active climbing across all players was about 90 seconds.
- Introduce a new mechanic, section or goal every few minutes so a session keeps escalating.
- Treat average active time per session as a primary playtest metric.

## 4. Treat mobile as the main platform

About a third of plays came from mobile, and mobile scored worst on every engagement metric: 1 min 51 s average playtime and 0.9% D1 retention.

- Design touch controls first, then map the keyboard onto them.
- Test on physical iPhone and Android devices before every submission. Most Frostbound updates were only checked in emulated browser viewports.

## 5. Report gameplay the way the portal measures it

The portal calculates conversion and playtime from the game's SDK gameplay start/stop calls. Frostbound only reported gameplay while its iframe had focus (`document.hasFocus()`). Our analytics showed mobile players starting runs more often than desktop players (84% vs 75%). The portal still measured mobile conversion at less than half the desktop figure, which suggests mobile play was undercounted.

- Report gameplay whenever a run is in progress and the page is visible. Don't make it depend on focus.
- Confirm the portal's QA tool detects gameplay on a physical phone, not only on desktop.
- During soft launch, compare the portal's dashboard with our analytics every day. Investigate any gap larger than about 10 points.

## 6. Don't iterate during the soft launch

- The soft launch lasted eight days. It ends once the game reaches enough plays, and scoring uses only the final seven days.
- When most metrics miss, an update can't fix the result. The game must be resubmitted as a new game with significant improvements.
- Frostbound shipped about ten updates during the window, including a full menu redesign. Measurement was split across versions, and no single version got a clean read.
- Hit the targets in our own playtests first. During the soft launch, ship bug fixes only.

## 7. Keep one codebase for every platform

The portal build lived on local-only branches with its own character model. Every main update had to be ported and re-verified by hand. Next time, keep one branch and switch platform behavior (SDK, saves, invites) with a runtime flag.

## Pre-submission checklist

- [ ] Most first-time testers reach one minute of play and voluntarily start a second run.
- [ ] The analytics funnel (load → run start → one minute of play → second run → next-day return) is live and verified.
- [ ] The portal's QA tool detects gameplay start/stop on desktop, iPhone and Android.
- [ ] Physical iOS and Android testing is complete.
- [ ] Load time is under 10 seconds and the build is under 20 MB.
- [ ] Gameplay is frozen for the soft launch window, with only bug fixes planned.
