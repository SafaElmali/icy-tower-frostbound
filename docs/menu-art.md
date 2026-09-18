# Frostbound title screen

The title screen displays the live Three.js tower: actual ledges, crystals, the equipped climber, lighting, and drifting snow. It reuses the gameplay canvas and renderer, with a right-offset tower composition on landscape screens and a centered tower on portrait screens. Transparent gradients keep the HTML menu readable. Ambient movement respects Reduced motion, and mobile uses the existing performance quality setting. The scene is painted before the optional character model finishes loading.

Text, buttons, focus states, dialogs, and responsive layouts remain in `app/game.tsx` and `app/title-menu.module.css`. Starting a climb transitions the same scene into gameplay without a background image swap.

The previous decorative image, `public/assets/menu/frostbound-tower.webp` (1672 × 941), is retained as an unused artwork asset. Its original generation prompt is recorded below.

Created using the built-in image generation tool, using the approved concept image as an edit target. Final prompt:

> Use case: precise-object-edit. Edit this exact game menu screenshot into a clean background plate for implementing its UI in real HTML. Remove ALL lettering, the FROSTBOUND title, subtitle and lines, Play Classic button and play icon, press enter caption, Game modes and How to play rows and icons and separator lines, bottom left sentence and bottom right speaker and gear icons. Inpaint their areas with the existing very dark blue-black softly blurred gothic tower background. Preserve EVERYTHING ELSE as identically as possible: same exact 16:9 framing, all architecture, lighting, icy platforms and their positions, glowing diamond, tiny orange climber, warm lamps, snow, colors, shadows, depth of field. Do not move or redesign any architecture or character. Keep the left half dark and uncluttered exactly as it currently is, no new objects in the removed UI areas. Output only the full-bleed background artwork, no text, buttons, lines, icons, logos or UI.
