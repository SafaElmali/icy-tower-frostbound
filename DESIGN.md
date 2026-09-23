---
name: Frostbound homepage
description: An arcade title screen over the live frozen tower.
colors:
  ink: "#eef8f3"
  muted: "#b4c9ce"
  accent: "#ffb389"
  divider: "#bdd9df2e"
  ice: "#d8f2f0"
  ice-hover: "#effff8"
  button-ink: "#123c48"
  rail: "#071a23e6"
  menu-panel: "#0c202a"
  menu-footer: "#081a23"
  menu-preview: "#b8e5e8"
  menu-preview-practice: "#b4d9b5"
  settings-group: "#061720"
  settings-divider: "#b4c9ce22"
  settings-switch-off: "#263e4b"
  settings-thumb-off: "#95b2c0"
  settings-thumb-on: "#244752"
  settings-muted-note: "#ffcbab"
  result-divider: "#b4c9ce26"
  result-hover: "#1b3541"
  goal-track: "#29414c"
  wardrobe-tab-active: "#24424f"
  wardrobe-footer: "#081b23"
  wardrobe-equipped: "#eef8f306"
  wardrobe-hover: "#eef8f30c"
  guide-key-border: "#b4c9ce40"
  guide-hover: "#eef8f308"
  guide-scrollbar: "#395761"
typography:
  pause-heading:
    fontFamily: "Frostbound Display, sans-serif"
    fontSize: "56px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.025em"
  pause-description:
    fontSize: "15px"
    lineHeight: 1.5
  pause-label:
    fontSize: "13px"
  pause-action:
    fontSize: "15px"
    fontWeight: 700
    letterSpacing: "0.01em"
  pause-metric:
    fontSize: "28px"
    fontWeight: 650
    lineHeight: 1.2
  display:
    fontFamily: "Frostbound Display, sans-serif"
    fontSize: "clamp(64px, 9.5vw, 96px)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.025em"
  menu-title:
    fontFamily: "Frostbound Display, sans-serif"
    fontStyle: italic
    fontSize: "46px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.025em"
  multiplayer-title:
    fontFamily: "Frostbound Display, sans-serif"
    fontStyle: italic
    fontSize: "clamp(42px, 5vw, 64px)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.025em"
  multiplayer-section:
    fontFamily: "Frostbound Display, sans-serif"
    fontStyle: italic
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  settings-heading:
    fontFamily: "Frostbound Display, sans-serif"
    fontStyle: italic
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  result-heading:
    fontFamily: "Frostbound Display, sans-serif"
    fontStyle: italic
    fontSize: "clamp(48px, 6vw, 72px)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
  result-metric:
    fontSize: "clamp(22px, 3vw, 28px)"
    fontWeight: 650
    lineHeight: 1.2
  goal-title:
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.35
  action:
    fontSize: "20px"
    fontWeight: 650
  activity:
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.4
  supporting:
    fontSize: "12px"
    lineHeight: 1.5
  wardrobe-item:
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
  wardrobe-description:
    fontSize: "12px"
    lineHeight: 1.45
  wardrobe-state:
    fontSize: "11px"
    lineHeight: 1.5
rounded:
  guide-key: "5px"
  wardrobe-tab: "7px"
  result-control: "10px"
  goal-progress: "3px"
  control: "6px"
  launch: "8px"
  menu-dialog: "16px"
  menu-dialog-mobile: "12px"
spacing:
  compact: "8px"
  control: "16px"
  section: "24px"
  desktop-gutter: "32px"
  multiplayer-columns: "40px"
  result-overview: "16px 0 26px"
  goal-inset: "4px 0 0 24px"
  wardrobe-columns: "28px"
  wardrobe-header: "30px 32px 24px"
  wardrobe-row: "14px 8px"
components:
  pause-menu:
    backgroundColor: "{colors.menu-panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.menu-dialog}"
    padding: "32px 32px 20px"
    width: "100%"
  pause-resume:
    backgroundColor: "{colors.ice}"
    textColor: "{colors.button-ink}"
    typography: "{typography.pause-action}"
    rounded: "{rounded.result-control}"
  pause-option:
    backgroundColor: "{colors.settings-group}"
    textColor: "{colors.muted}"
    typography: "{typography.pause-label}"
    rounded: "{rounded.result-control}"
    padding: "12px 8px"
  guide-keycap:
    backgroundColor: "{colors.settings-group}"
    textColor: "{colors.ink}"
    rounded: "{rounded.guide-key}"
    padding: "0 8px"
    height: "30px"
  wardrobe-option:
    textColor: "{colors.ink}"
    typography: "{typography.wardrobe-item}"
    padding: "{spacing.wardrobe-row}"
  wardrobe-option-equipped:
    backgroundColor: "{colors.wardrobe-equipped}"
  wardrobe-tab-active:
    backgroundColor: "{colors.wardrobe-tab-active}"
    textColor: "{colors.ink}"
    rounded: "{rounded.wardrobe-tab}"
    padding: "8px"
  run-result:
    backgroundColor: "{colors.menu-panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.menu-dialog}"
    padding: "32px"
    width: "100%"
  result-retry:
    backgroundColor: "{colors.ice}"
    textColor: "{colors.button-ink}"
    rounded: "{rounded.result-control}"
  result-retry-hover:
    backgroundColor: "{colors.ink}"
  settings-group:
    backgroundColor: "{colors.settings-group}"
    textColor: "{colors.ink}"
    rounded: "{rounded.menu-dialog-mobile}"
    padding: "22px 20px 16px"
  race-mode-selected:
    backgroundColor: "{colors.ice}"
    textColor: "{colors.button-ink}"
    rounded: "{rounded.launch}"
    padding: "14px 12px"
  multiplayer-host:
    backgroundColor: "{colors.menu-panel}"
    rounded: "{rounded.menu-dialog}"
    padding: "26px"
  button-primary:
    backgroundColor: "{colors.ice}"
    textColor: "{colors.button-ink}"
    rounded: "{rounded.launch}"
    padding: "16px 24px"
    width: "100%"
  button-primary-hover:
    backgroundColor: "{colors.ice-hover}"
  menu-preview:
    textColor: "{colors.menu-preview}"
    padding: "0 8px"
---

# Design System: Frostbound Homepage

## Overview

The homepage is a winter arcade title screen. The actual Three.js tower provides the scenery; a condensed wordmark and tactile launch button anchor the interface. This contract covers `components/title-menu.tsx` and `app/title-menu.module.css`. The scoped game menu shell and multiplayer entry below extend this contract; gameplay HUDs and unrelated dialogs retain their existing systems.

## Colors

Cool white carries primary text, blue-gray supports secondary labels, and peach marks small navigation and progress details. The pale ice button is the strongest surface. Translucent navy scrims maintain readable foreground content while revealing the tower.

## Typography

The locally hosted Barlow Condensed ExtraBold Italic font is registered as Frostbound Display in shared `app/globals.css` (not `app/title-menu.module.css`) and used for the uppercase wordmark and scoped menu/multiplayer headings. Body and controls inherit the application's existing font. Activity names are 17px desktop, 16px at narrower widths; secondary labels are 12px. The mobile wordmark uses `clamp(52px, 15vw, 88px)`.

## Layout

Four rows organize the viewport: utility header, flexible centered launch area, activity rail, and factual footer. Desktop rail and footer share a 1120px maximum width. Below 1000px the composition tightens; below 700px utilities become icons and rail entries stack. Short landscape layouts reduce hero spacing and allow vertical scrolling to the footer. Preserve safe-area padding and avoid horizontal overflow.

### How-to-play dialog layout

Only `components/how-to-play-dialog.tsx` and `components/how-to-play-dialog.module.css` are covered by this extension, following `.impeccable/surfaces/how-to-play.md`. The standalone `/how-to-play` page retains its existing design. The flex-column dialog is at most 720px wide, with width `calc(100vw - 32px)` and maximum height `calc(var(--visible-height, 100dvh) - 32px - var(--safe-top, 0px) - var(--safe-bottom, 0px))`. Its vertical center follows `--visible-top` and `--visible-height`. Header, tabs and footer remain visible while the active panel scrolls with `min-height: 0`, `overflow-y: auto`, contained overscroll and a thin guide-scrollbar on menu-panel track. Header padding is 30px 32px 24px; tabs have 32px side margins; panel padding is 18px 32px 28px; footer padding is 20px 32px.

At ≤540px, width becomes `calc(100vw - 24px)`, header padding 24px 20px 20px, title 35px, tab margins 20px, panel padding 12px 20px 22px, and footer padding 14px 20px. Tabs shrink from 42px to 40px minimum height; footer controls from 48px to 44px. At ≤360px, control rows become one column, keys indent 25px, and the practice icon hides. At heights ≤550px, header vertical padding becomes 16px, title 32px with 6px bottom margin, and footer vertical padding 12px. These rules are scoped to the dialog.

## Elevation & Depth

The live tower supplies spatial depth. The primary button uses an inset icy bevel and a diffuse shadow to suggest a pressable surface. Navigation stays flat with subtle dividers; do not generalize the button's bevel to every container.

## Shapes

The launch button has an 8px radius, small controls use 6px, and the activity rail has square corners. Thin separators group related navigation without turning every action into an isolated card.

## Components

### How-to-play tabbed guide

The Read-mode guide opens on **Controls**, with **Climbing** and **Modes & more** as sibling Base UI tabs. Retain Base UI dialog/tab semantics and initial focus on the title. Controls presents Move (A/D or arrows), Jump (Space/W/up), and Pause (Esc/P) as flat divided rows, followed by the shaded touch guide: hold direction, tap and release JUMP, slide to turn, and use Menu to pause. Climbing contains five native `details` disclosures (walls, combo, frost, hazards, frenzy); Modes & more contains Party and ghost disclosures, the original-rules notice, full gameplay guide link, and measurements action. Keep the full guide as an ordinary `/how-to-play` anchor for static-export navigation.

The shell uses menu-panel/ink, 16px menu-dialog rounding, no border, and `0 28px 100px #0008` shadow. Its uppercase heading uses menu-title; description is muted 14px/1.5 (12px on phones). Tabs sit on settings-group with 4px padding/gap and 10px rounding; triggers use muted 13px text, 7px rounding, and 8px 12px padding. Active tabs use wardrobe-tab-active and ink. Control rows use `1fr auto`, a 10px 20px gap, 18px vertical padding and result-divider separators. Peach 20px icons precede 600 17px headings. The guide-keycap token has a 30px minimum width, 1px guide-key-border, inherited 500 12px/1 type, and 6px gaps. Supporting text is muted 13px/1.6, indented 32px. The touch block has square corners, settings-group fill, 22px top margin and 18px 20px padding; its heading is 600 15px/1.4 and body 12px/1.7. Phone keycaps are 24px minimum width, 28px high, 11px type, 0 5px padding, and 4px gaps; row copy becomes 12px with a 25px indent.

Native disclosure summaries use a 22px/minmax(0,1fr)/16px grid with 14px gaps, 84px minimum height and 16px 4px padding. Titles are 600 15px/1.5, tips muted 12px/1.55, and detail copy muted 13px/1.75 with 0 24px 20px 40px padding. Hover/open summaries use guide-hover; open icons turn peach and the chevron rotates 180 degrees. On phones, summaries become 20px/minmax(0,1fr)/14px with 10px gaps and 82px minimum height; title/detail type becomes 14px/12px and detail padding 0 12px 18px 30px. Multiple native disclosures can remain open.

The persistent footer uses wardrobe-footer. “Try guided practice” calls `onPractice` and is disabled until ready. The ice primary control reads “Let’s climb” and calls `onPlay`, or “Back to game” and closes the dialog when active; it is disabled only when neither active nor ready. It uses button-ink, 10px rounding, 650 14px type, 0 20px padding and 156px minimum width (12px type, 0 14px padding and 116px minimum width on phones). Hover turns ink-colored white. Measurements calls `onMeasurements`. Buttons, summaries and links receive a 2px accent focus outline with 3px offset. Tab color/background, summary background and chevron transform transitions last 150ms; system reduced motion and `html[data-reduced-motion='true']` suppress transitions. Preserve all mechanics and callback behavior.


The launch button preserves readiness, loading, failure, and contextual labels. Its hover lift is 3px; activation depresses it by 1px. Mode selection remains immediately below it. Utility icons retain accessible names when their visible text disappears. Activity links and buttons keep their native semantics. Scores, rewards, and milestones always come from actual game state.

Focus uses a 2px peach outline with a 4px offset. Hero entrance lasts 650ms; reduced-motion settings suppress the entrance and movement. Existing callbacks retain their behavior.

### Completed-run result

This scoped extension documents `components/run-result.module.css`, `components/next-climb.tsx`, `components/next-climb.module.css`, and `components/run-summary-dialog.tsx`. It applies to completed runs; the pause shell keeps its separate appearance. The floor heading leads visually, with the mode context subordinate; outcome and next reachable goal share the board. Follow the surface brief in `.impeccable/surfaces/run-result.md` for conditional daily, challenge, practice, and Jev content, rewards, and rankings.

The shell is at most 760px wide. The menu-panel board uses the run-result component tokens, no border, and a `0 28px 100px #0008` shadow. Above 600px the overview has two equal columns separated by the desktop-gutter spacing token; its margins use result-overview. Metrics use 1.2fr/1fr columns, a control-sized gap, and section-sized top margin. The goal uses goal-inset and a 1px result-divider on the left. At ≤600px the board padding and overview gap become section-sized, columns stack, overview margins become 14px 0 24px, and the goal divider moves to the top with 18px top padding. This is a local result layout, not a replacement for homepage or menu grids.

The result-heading token is uppercase italic display type, 56px on phones. Mode context is muted 12px/1.5 with 0.04em tracking; metric values use result-metric with tabular numerals. The goal uses one h3, “Next climb: Reach floor 30” in the illustrative preview, with ink-colored goal-title type (600 18px/1.35, 16px on phones). Its flex layout aligns on the baseline with an 8px gap, balanced wrapping, and a 0 28px 0 0 margin. The aria-hidden 16px Target icon is peach, does not shrink, aligns to flex-start, and has a 4px top margin. There is no separate goal label. Progress tracks are 4px tall with goal-progress rounding, goal-track backgrounds, and ice fills. Record feedback and unlock text use accent; ordinary highlights and supporting copy use muted.

A full-width retry control follows the overview, with a 56px minimum height, 700 15px type, no border or shadow, and the result-retry colors and radius. Hover uses result-retry-hover. The 11px retry hint hides on phones. Optional reward/ranking actions use settings-group backgrounds, result-hover on hover, 48px minimum height, 12px 16px padding, result-control rounding, and 8px gaps. Their top margin is 20px (12px on phones). The quiet details/title footer uses muted 12px controls and a result-divider, with 20px top margin and 12px top padding (12px and 8px on phones). Button focus uses a 2px accent outline offset by 3px.

The board arrives over 360ms with `cubic-bezier(0.16, 1, 0.3, 1)`, moving from translateY(12px) to zero while its clip-path opens from `inset(0 0 3% round 16px)` to `inset(0 round 16px)`. System reduced motion and `html[data-reduced-motion='true']` disable this animation. Preserve Base UI dialog semantics, heading initial focus, supplied return focus, and disabled pointer dismissal. Closing exits a completed run and resumes a paused run; Enter outside buttons/links invokes continue, while P does so only when paused, with editable controls, repeated keys, and modifier chords excluded as implemented.

### Pause menu

Scoped to the paused branch of `app/game.tsx`, `components/run-summary-dialog.tsx`, and `components/run-result.module.css`; follows `.impeccable/surfaces/pause-menu.md`. The centered shell is `min(440px, 100%)` with 24px overlay gutters. The pause-menu panel keeps the shared result shadow and 16px rounding. At ≤480px, gutters become 16px and panel padding becomes 28px 24px 16px.

“Paused.” uses pause-heading in italic uppercase, reducing to 48px at ≤480px, with 44px right clearance for Close. “The tower can wait.” uses muted pause-description and 10px top margin. Floor and Points use equal columns with 24px gap, 28px vertical margins, and a result-divider between columns with 24px left inset. Labels use pause-label with 6px bottom spacing; pause-metric values use tabular numerals and permit wrapping. Values come from the current run, with localized points.

Resume climb is full-width, at least 56px high, using pause-resume; hover uses ink. Settings / How to play form two equal columns with an 8px gap and 12px top margin; pause-option controls are at least 48px high, with result-hover and ink on hover. Their trailing chevrons are hidden. Back to title is a centered, quiet muted pause-label action, at least 44px high, below a result-divider with 20px top margin and 12px top padding. Close is a 44px square attached to the shell, inset 16px (12px at ≤600px), with result-control rounding and guide-hover fill. Buttons use a 2px accent focus outline offset by 3px.

Retain heading initial focus, supplied return focus, disabled pointer dismissal, and Close/Escape/P resume behavior; Enter outside buttons/links continues, with the existing editable-control, repeat and modifier guards. Settings and help keep their existing callbacks; Back to title keeps the leave confirmation. The shared result-arrive animation and both reduced-motion overrides apply. The sidecar preview uses illustrative scores and static controls; production owns dialog semantics and gameplay actions. This extension does not redefine completed-run or other surface tokens.

### Character menu

This narrow extension covers `components/wardrobe.tsx` and `components/wardrobe.module.css`; the surface brief is `.impeccable/surfaces/wardrobe.md`. The actual live CharacterPreview sits beside Hats, Sweaters, and Star trails tabs. Keep Base UI dialog/tab keyboard behavior, native radios grouped by slot inside labelled fieldsets, and disabled locked choices. Choosing an unlocked radio calls `onEquip` immediately; Done closes the dialog, with no separate save step.

The menu-panel shell is a flex column, at most 880px wide, constrained to viewport width and dynamic height minus 32px, with menu-dialog rounding and a `0 28px 100px #0008` shadow. The header uses wardrobe-header spacing; the independently scrolling body uses 0 32px 28px padding, wardrobe-columns gap, and 0.85fr/1.2fr columns. The preview uses settings-group navy, square corners, a 290px stage, and a caption padded 16px 18px with an 8px gap. At ≤720px columns become 0.7fr/1.2fr, body padding becomes 0 24px 24px, gap becomes 20px, and the stage becomes 250px. At ≤560px the body stacks preview above selector with a 16px gap and 0 20px 20px padding. The preview itself becomes two equal horizontal columns, with a compact 148px stage and 12px caption padding. The shell then uses viewport minus 24px; its 16px radius remains unchanged.

The title reuses menu-title typography, reducing to 40px at ≤720px and 35px at ≤560px. Description is muted 14px/1.5 (12px on phones). Preview name is 600 16px (14px on phones), supporting copy 12px/1.6 (11px/1.5 on phones). Tabs use 13px type, 42px minimum height, 4px container padding/gap and 10px outer rounding; on phones they use 12px type and 40px minimum height. The active tab uses wardrobe-tab-active. Choice rows use wardrobe-item, wardrobe-description and wardrobe-state typography, tabular status numerals, a 40px/minmax(0,1fr)/61px grid, 12px gaps, 96px minimum height, and result-divider separators. At ≤720px row columns become 28px/minmax(0,1fr)/54px with 8px gaps and 4px horizontal padding; on phones row height becomes 84px and item/description sizes become 13px/11px. Swatches use actual cosmetic colors, 27px icons and 5px dots with 2px gaps.

Equipped rows use wardrobe-equipped with peach check/status; unlocked hover uses wardrobe-hover. Radio focus outlines the whole row in 2px accent, offset -2px, with control rounding. Locked rows retain readable copy and show an accessible native progress element: value is min(profile progress for the item's metric, target), maximum is the actual target, with localized value/target text. Tracks use goal-track, ice fills, 3px height and goal-progress rounding. The reward total counts only cosmetics with target > 0 and uses `isUnlocked`; starter items do not inflate earned progress. Trail copy explains airborne combos of 2× or more.

The persistent footer uses wardrobe-footer, 20px 32px padding and a 24px gap. Done uses ice/button-ink, 10px rounding, 48px height, 140px minimum width, 0 20px padding and 650 14px type; hover uses ink. At ≤560px footer padding is 14px 20px, gap 16px, and Done is 44px high with 92px minimum width and 0 14px padding. Muted saving copy is 11px/1.6 (10px on phones): “Your kit saves automatically on this browser.” When storage is unavailable, show “Storage is unavailable. Your kit lasts for this session.” Keep the note about new leaderboard scores. Button focus is a 2px accent outline offset 3px.

Tab color/background transitions last 150ms with default ease; system reduced motion and `html[data-reduced-motion='true']` suppress them. The shared preview retains loading/error messages, a polite outfit description and Pause/Play control (44px minimum height, 36px on phones); its initial playback follows the system reduced-motion preference. The preview mounts only while the dialog is open. All wardrobe overrides of shared preview classes remain beneath the CSS-module card selector, preserving CharacterPreview in multiplayer and elsewhere. The sidecar selector sample is illustrative static documentation; production owns live rendering, equip state and persistence.

### Daily tower panel

This scoped extension covers `DailyTowerCard` in `components/daily-tower.tsx`, `components/daily-tower.module.css`, and its daily dialog integration in `app/game.tsx`. Follow `.impeccable/surfaces/daily-tower.md` for the surface brief. A single flat date → personal record → actions composition uses the existing menu-panel, ink, muted, accent, ice, and button-ink tokens. The card adds no nested background, border, radius, or shadow. The gameplay banner and share-link dialog retain their existing presentation and behavior.

The scrollable dialog is at most 620px wide, with viewport width and dynamic height minus 32px, 32px padding, menu-dialog rounding, no border, and `0 28px 100px #0008` shadow. Its title reuses menu-title; the muted introduction is 14px/1.5 with 28px bottom margin. The date row has 24px vertical padding, 18px gap, result-divider rules above and below, and a peach 28px calendar icon. Date text is 600 28px/1.2 with -0.02em tracking and tabular numerals. It formats `daily.date + 'T00:00:00Z'` using `Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })`; the semantic time element retains the original date as `dateTime`. The subordinate 12px/1.5 line reads “Classic · Daily route · UTC” or “Classic · Shared tower · UTC” when `onToday` exists.

The record row has 26px vertical padding, an 18px gap, and a muted 22px trophy. Its 600 16px/1.4 tabular heading displays the actual best floor; the muted 12px/1.5 detail uses `best.score.toLocaleString()` points for this tower. Without a best, show “Set your first best.” and “Finish a climb, then come back to beat it.” Do not substitute illustrative preview values for saved progress.

Actions share a horizontal row with a 12px gap. Buttons have 54px minimum height, 12px 18px padding, result-control rounding, and 14px type. The flexible ice/button-ink primary uses weight 700 and switches between “Climb this tower” and “Climb again”; its hover uses ink. Optional “Share tower” uses settings-group navy and ink, with wardrobe-tab-active on hover. Preserve `onStart` → `playDaily(dailyChoice)`, `onShare` → `openDailyShare(dailyChoice)`, and the original seeded/versioned shared tower. Archived-date choices expose `onToday` → `setDailyChoice(todayDailyTower())` through “Switch to today’s tower”; this transparent full-width 13px action has 44px minimum height and 10px top margin. Sharing remains on the selected original tower until the player explicitly switches.

The parent `fieldset disabled={!ready}` disables all panel buttons during loading; the card has no separate disabled prop. Start and Share receive opacity 0.5 and a wait cursor through `:disabled`; the today action inherits native disabling without that action-row styling. All card buttons use a 2px accent focus outline offset by 3px. Action background transitions last 150ms and are suppressed by system reduced motion and `html[data-reduced-motion='true']`.

At ≤540px, dialog padding becomes 26px 22px, the title 38px, introduction 13px with 24px bottom margin, date text 23px, and calendar width 24px. Date and record gaps become 14px with 22px and 24px vertical padding respectively. Actions stack full-width with an 8px gap; Share reduces to 44px minimum height. The divided note uses muted 11px/1.6 type, 24px top margin and 18px top padding (20px/16px on phones): a new tower arrives at 00:00 UTC, and shared links always keep their original tower. Unlimited retries remain available. The sidecar preview is a tiny illustrative sample; production owns callbacks, live records, loading, and dialog semantics.

## Do's and Don'ts

- Keep the live tower visible and Begin ascent unmistakable.
- Preserve the compact header and shared navigation rail.
- Use actual player progress and scores, including honest empty states.
- Do not apply homepage-specific typography and sizing to other screens without reviewing their needs.
- Do not replace the real scene with generic decorative imagery.

## Game menu shell

The completed redesign in `app/game-menu.module.css` extends the homepage ice-and-ink palette to the game menu without changing the homepage system. The dialog is a dark `#0c202a` flex column, at most 860px wide, with a 16px radius and `0 32px 100px #0008` shadow. Its body scrolls independently; the `#081a23` footer stays visible outside that scroll region. Viewport height and safe-area variables constrain the shell.

Above 600px, a native radio list and its selected mode details/route diagram share equal columns with a 24px gap. Selected rows use `#d8f2f0` with `#123c48` text; keyboard focus uses a 2px `#ffb389` outline offset by 3px. At 600px and below, the layout stacks with an 18px gap, the diagram is hidden, and the dialog uses a 12px radius and 20px body gutters.

Menu titles use italic 800 Frostbound Display at 46px/1, uppercase with -0.025em tracking; mobile titles are 35px, and short viewports (height ≤600px) use 32px. `components/mode-preview.tsx` pairs an aria-hidden platform-route SVG with a heading, description, and two factual traits. Preview headings are 34px/1.1, reducing to 28px on mobile. Arcade uses `#b8e5e8`, party `#ffb389`, and practice `#b4d9b5`; party shows a higher trajectory and springs, while arcade adds a frost line.

Flat divided action rows retain the shell’s density. The old generic settings rows have been removed from this stylesheet; settings now use the dedicated extension below. Selection and hover transitions last 150ms; system and application reduced-motion preferences suppress transitions. Keep the footer action available while browsing the body, preserve native radio semantics, and keep mode descriptions visible when the decorative diagram is hidden.

## Multiplayer entry extension

`components/race-entry.module.css` and `components/race-mode-picker.module.css` extend the frozen arcade system. Content is centered at a 1120px maximum width. A full-width compact identity strip sits above the lobby browser on the left and navy host form on the right. Columns use 1.2fr/1fr with a 40px gap, become equal with a 24px gap at ≤950px, and stack at ≤760px. The host panel reuses the menu panel color and 16px radius; its padding is 26px, 22px at ≤950px, 26px at ≤760px, and 22px 18px at ≤480px.

Uppercase italic 800 Frostbound Display titles use `clamp(42px, 5vw, 64px)/1`, then 48px at ≤760px and 44px at ≤480px. Browser and host section headings use 34px/1.1, reducing to 32px at ≤480px. The identity strip retains the player name and edit control; secondary profile notes disappear at ≤950px and outfit badges and edit text at ≤480px.

Race mode selection preserves native radios in two columns, stacking at ≤360px. Selected mode labels use pale ice with dark ink; radio accent is #285965 and selected supporting text is #365966. Visibility options remain native radios with a subtle ice tint and selected icon, rather than the mode picker's solid light fill. Focus uses a 2px peach outline offset by 3px. Disabled controls retain their documented dimmed state.

The profile dialog is at most 480px wide, constrained to the viewport minus 32px, scrollable, and rounded to 16px. It uses 28px padding (24px at ≤480px) and a 36px/1.05 display title (32px at ≤480px). The actual character remains in profile editing. Preserve live lobby polling, honest empty states, direct invitation joining, and the host shortcut's focus/scroll behavior with reduced-motion support. This extension preserves the homepage and climb-menu contracts above.

## Settings extension

`components/game-settings.tsx` and `components/game-settings.module.css` extend the existing menu shell with Audio and Feel & detail groups. Above 600px, two equal `minmax(0, 1fr)` columns have a 16px gap. Each dark settings group uses 22px 20px 16px padding and a 12px radius. At ≤600px, groups stack with a 16px gap and become flat transparent sections with zero padding and radius. This extension preserves the homepage, climb menu, and multiplayer contracts.

Group headings use the globally registered Frostbound Display face: italic uppercase 800, 28px/1.1 with -0.015em tracking, reducing to 24px on phones. Labels use 600 14px/1.4; descriptions use muted 12px/1.6; explicit states use 11px/1. Rows have a thin settings divider, a flexible copy column, a 48px control column, a 14px gap, and 102px minimum height (74px on phones). Phone layouts hide group introductions and ordinary notes but retain the muted-audio explanation.

Retain the shared accessible `Switch` from `components/ui/switch.tsx` (Base UI), label activation, keyboard behavior, and label/description associations. Tracks are 44×26px with 3px padding and a 1px `#7b9aa666` border; thumbs are 18px and move 18px when checked. Off uses the settings switch/thumb colors; On uses ice with the dark checked thumb. Visible On, Off, and Muted text supplements the switch; the visual state text is aria-hidden because the switch conveys its checked state. Music stays independently selectable while Game sound mutes all audio: show Muted only when music is selected and sound is off, preserve the music choice, and explain the dependency in its description and peach-tinted group note.

Fullscreen is a separate divided action below the groups, with 20px top margin/padding. Its transparent outlined button has an 8px radius, 46px minimum height, and 12px 14px padding; it spans the phone layout. Enter fullscreen / Exit fullscreen and supporting copy follow `document.fullscreenElement` through `fullscreenchange`, including browser-driven exits. Button focus uses a 2px peach outline offset by 4px. Switch background transitions last 150ms; both system and application reduced-motion settings suppress transitions. Fonts already live in `app/globals.css`; no duplicate font registration is needed.
