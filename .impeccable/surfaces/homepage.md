# Homepage

Mode: Experience

## Direction

THESIS: The tower is already alive; starting a climb is the unmistakable first action.

OWN-WORLD: A winter arcade title screen. Condensed italic lettering, an icy launch button, quiet navy surfaces, peach wayfinding details, and the actual Three.js tower supply the identity.

STORY: Recognize the game, begin climbing, then discover daily routes, friends, and personal progress.

FIRST VIEWPORT: A compact utility header, centered Frostbound title and Begin ascent button, a mode selector, a lower navigation rail, and factual records. Keep the live tower visible between these regions. At phone widths stack the rail; short landscape screens scroll vertically to the footer.

FORM: A four-row viewport grid. The hero has a single restrained entrance, the launch button lifts on hover and depresses on activation, and link arrows respond to hover/focus. Honor reduced motion.

## Design decisions

The user delegated the design direction. Three compositions were considered: centered arcade title screen, expedition journal, and dense mode-selection hub. The arcade screen best serves immediate play and the existing live scene. Implementation is code-led; no bitmap comp was produced or approved.

The concept-seed tool ran with key `d550b70e` and assigned index 5, curved paper crease. This was exploratory input, not a user selection. The arcade composition was retained under the user's instruction to choose the strongest product fit autonomously. No comparison cards were produced; review does not claim fidelity to a comp or an external quality reference.

## Required behavior

Preserve game readiness and failure states, challenge context, current mode, sound state, outfit notices, actual best scores, actual milestones, dialog callbacks, and the native multiplayer route. Text and icons retain accessible names, including compact mobile utilities.

## Verification

Captured 1440×900, 390×844, user width 761×843, and landscape 844×390. Mode chooser, daily dialog, progression, outfits, and multiplayer navigation verified in the live app. Typecheck, lint, and Netlify static production build pass.
