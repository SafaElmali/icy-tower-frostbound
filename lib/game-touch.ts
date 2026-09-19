import type { MouseEvent } from 'react';

/** Block touch callouts without taking copy/paste away from editable fields. */
export function preventTouchContextMenu(event: MouseEvent<HTMLElement>) {
  if (
    event.target instanceof Element &&
    event.target.closest(
      'input, textarea, [contenteditable]:not([contenteditable="false"])',
    )
  )
    return;
  if (
    ('pointerType' in event.nativeEvent &&
      event.nativeEvent.pointerType === 'touch') ||
    window.matchMedia('(any-pointer: coarse)').matches
  )
    event.preventDefault();
}
