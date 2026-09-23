# Leaderboards and friend challenges

[← Back to README](../README.md)

Submit verified scores or share a tower for friends to beat. For simultaneous play, see [two-player races](multiplayer.md); for a local replay rival, see [Race your ghost](gameplay.md#race-your-ghost).

- [Leaderboard](#leaderboard)
- [Friend challenges](#friend-challenges)

## Leaderboard

Open **Menu → Leaderboard** to see the top 50 runs on the **Classic** or **Party** tab. Each tab has a **Season 2** / **Legacy** switch: Season 2 began with rules version 9 (two-floor combo jumps and a capped multiplier), which changed the score scale, so version 9+ runs rank on fresh boards while version 1–8 runs keep their existing Legacy boards. The verified recording's rules version chooses the season; the API accepts `season=current|legacy` (default `current`) alongside `mode`. After a completed Classic or Party run, choose **Submit score & leaderboard**, enter a public display name, and submit. Scores, floors, combos, and mode-specific physics are replayed and calculated on the server. The verified recording selects the board; Party scores cannot be submitted to Classic rankings. Legacy recordings remain valid under their original rules; version 4 recordings use uncapped pace and controlled wall jumps; version 5 adds route choices; version 6 adds hazards, frenzy, and tower encounters; version 7 adds difficulty increases every 50 floors; version 8 adds denser hazards without advance markers; version 9 requires two-floor jumps for combos and caps the multiplier at 10×. Practice runs do not qualify; ranked recordings support up to 30 minutes and 12,000 input changes. Ties favor the higher floor, then the faster run.

The leaderboard uses a Netlify Function and site-wide Netlify Blobs storage, so scores persist across deployments and are shared across devices. Conditional writes protect concurrent submissions, and identical recordings cannot be added twice while on the board. Replay validation prevents fabricated score totals; it is not a guarantee against automated play. No login is required, and display names are not reserved identities. The name field is remembered only on the player's device.

The leaderboard API runs on Netlify; the plain Vite preview serves only the leaderboard frontend. Race rooms also work in Vite using a development-only shared memory store. `npm test` includes real local Blobs persistence, replay verification, request validation, and concurrent-write coverage.

## Friend challenges

After a completed run that reaches at least floor 1, choose **Challenge a friend** to share or copy a “Beat my floor 87” link. The link contains that run's tower seed, layout/rules version, mode, floor, and score. Friends open it, choose **Accept challenge**, and climb the same tower; **Retry challenge** and Enter keep that layout and mode. The HUD and results show the targets, with floor and score wins tracked separately. Matching the floor is a tie; climb one higher to beat it.

Classic, Party, and Practice runs can be shared, and a challenge keeps its original mode and rules, including on retry and re-sharing. Older challenges retain capped pace and automatic rebounds; leaving a challenge restores the current rules. Choose **Leave challenge** on the title screen to return to random towers. Invalid or unsupported links show a message and allow a normal climb. If native sharing or clipboard access is unavailable, the share dialog has a selectable link for manual copying. Challenge targets are informal, editable link data; leaderboard submissions still require server replay verification.
