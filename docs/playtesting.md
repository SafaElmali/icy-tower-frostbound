# Frostbound playtest protocol

No human sessions have been run as part of implementation. Recruit 8–12 new players for a diagnostic round, aiming for a mix of mobile and desktop. Use anonymous participant codes on an observer sheet, never names in the game's measurements. Obtain permission to take notes or record the screen. Do not coach: say “Play as you normally would; you may stop whenever you like.” Allow up to 10 minutes, without requesting a second run.

Before testing, record the feature version, device, mode, experiment hypothesis and decision threshold. For each participant use a fresh browser profile or clear playtest measurements and gameplay progression separately. Clearing measurements does not reset tutorials, records or skill progression.

Observe without interruption:

- Time to discover moving and jumping; whether momentum is deliberately used within three runs.
- First death cause and, at a natural pause, the player's answer to “What happened?” Compare their explanation with the visible game state.
- Whether they start a second run voluntarily, and what they intend to try differently.
- Early skill goals completed; floor and combo across the first five runs; confusing prompts, missed buttons and accidental retries.
- At the end ask what was enjoyable, what was frustrating, and what they would try next. Do not equate time spent with enjoyment.

Use one observer-sheet row per participant: code, version, device, mode, first jump time, momentum discovered (yes/no and evidence), death understood (yes/no and quote), voluntary second run (yes/no), run 1–5 floors/combos, goal completions, enjoyment/friction notes. Keep identity/contact details separately if scheduling a follow-up.

## Predefined experiment

Hypothesis: guided movement, reachable goals and useful results feedback improve understanding and voluntary replay. For the initial diagnostic round, aim for at least 8 of 10 participants to discover moving/jumping without help, 7 of 10 to explain their first fall, and 7 of 10 to voluntarily retry. Scale these proportions to the final 8–12 participants. These are product targets, not research-established thresholds or statistical proof. Investigate repeated confusion even when aggregate targets pass.

For a subsequent controlled comparison, assign participants to versions before play, use equivalent input devices and modes, and predefine sample size and observation window. Primary measure: voluntary first-to-second run rate in the first observed session. Secondary: skill-goal completion among run starts and next-day return. Do not ship solely because session duration rises; examine enjoyment feedback and failures. Small diagnostic samples cannot establish population retention effects.

## Built-in local report

Open **Playtest measurements** to inspect, export JSON or clear data. The game stores at most 300 run records locally; no data is transmitted. Browser storage denial falls back to memory. Exports contain timestamps, session/run IDs, device category, mode, feature version, completed goal IDs and end-of-run performance, with no player name, typed input or input replay.

`beginRun` records an actual player-started run, not opening the home page. `finishRun` is idempotent; `abandonRun` separately marks menu exits, restarts and unloads without treating them as deaths. Unfinished/abandoned runs remain in start denominators. `completeGoal` records each completed skill goal once per run. Practice, daily and challenge contexts must be labelled distinctly when invoking the API. Device uses coarse pointer as a practical mobile proxy, not exact hardware identification.

Reports split by device, mode and feature version. A session spans starts, finishes and goal completions less than 30 minutes apart. Replay rate is sessions with at least two starts divided by sessions with a start in that group, including the current session. It is not necessarily a voluntary retry: observer notes identify accidental starts or coached retries. Feature or mode switches create separate group observations within the same session.

Next-day return is a run in the same group on the UTC calendar day following its first run. A negative result is only assigned after that full UTC day has elapsed. UTC does not match every participant's local day. One installation produces at most one acquisition/return observation per group; exported records are required to combine separate consenting participants. After any history eviction, acquisition retention is marked unavailable, while run/session rates describe retained history and may contain partial sessions. Browser clears, shared browsers, multiple devices, multiple tabs and manual clock changes limit interpretation. Use one active tab during supervised tests.

For aggregation, combine one export per anonymous participant; if collecting updates, replace their previous export rather than double-counting. Filter by the predefined version/device/mode, use the first session for the experiment's primary measure, and exclude pending/truncated next-day observations from the mature return denominator. Collect next-day exports after the observation window through the chosen consented research process. There is no central dashboard or automatic cross-person inference.

## Action mechanics diagnostic round

Use feature version `tower-action-v1` and rules version 6 for the action update. Keep archived version 5 runs in a separate comparison group. Observe whether players recognize cracked ledges before landing, leave a marked icicle lane before impact, discover bat stomps, and understand why frenzy begins and ends. Note whether any warning appears too late or conflicts with another prompt on a phone.

Check the first introduction of each hazard, an ice shower, collapsing stairs, and the calm stretch after each encounter. Ask players to describe a recent close call in their own words. A useful outcome is a deliberate dodge, recovery, or risky stomp followed by an unprompted retry; longer sessions alone do not establish that the new mechanics are more fun. Tune warning times and encounter spacing from those observations.
