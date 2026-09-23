'use client';

import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import type { TowerInput } from '@/lib/tower-input';

/** Keyboard holds and assistive clicks use their own sources, preserving simultaneous fingers/keys. */
export function useGameControlKeys(
  input: TowerInput,
  active: boolean,
  onChange: () => void,
) {
  const sources = useRef(new Set<string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const held = sources.current;
    const pending = timers.current;
    const clear = () => {
      for (const source of held) input.release(source);
      held.clear();
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
    if (!active) clear();
    return clear;
  }, [active, input]);

  const release = (source: string) => {
    input.release(source);
    sources.current.delete(source);
    onChange();
  };
  return {
    onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!['Space', 'Enter'].includes(event.code)) return;
      event.preventDefault();
      event.stopPropagation();
      const control = event.currentTarget.dataset.control;
      if (
        !active ||
        (control !== 'left' && control !== 'right' && control !== 'jump')
      )
        return;
      const source = `button-key:${event.code}`;
      input.press(source, control);
      sources.current.add(source);
      onChange();
    },
    onKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
      if (!['Space', 'Enter'].includes(event.code)) return;
      event.preventDefault();
      event.stopPropagation();
      release(`button-key:${event.code}`);
    },
    onBlur() {
      release('button-key:Space');
      release('button-key:Enter');
    },
    onClick(event: MouseEvent<HTMLButtonElement>) {
      // Pointer presses are already handled with capture; only virtual clicks need a pulse.
      if (event.detail !== 0 || !active) return;
      const control = event.currentTarget.dataset.control;
      if (control !== 'left' && control !== 'right' && control !== 'jump')
        return;
      const source = `button-click:${control}`;
      clearTimeout(timers.current.get(source));
      input.press(source, control);
      sources.current.add(source);
      onChange();
      timers.current.set(
        source,
        setTimeout(() => {
          release(source);
          timers.current.delete(source);
        }, 120),
      );
    },
  };
}
