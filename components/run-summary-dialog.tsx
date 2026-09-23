'use client';

import { useRef, type ReactNode } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import styles from './run-result.module.css';

/** Keep the world visible, but move keyboard and assistive focus into the run's next step. */
export function RunSummaryDialog({
  open,
  paused,
  onContinue,
  onExit,
  returnFocus,
  children,
}: {
  open: boolean;
  paused: boolean;
  onContinue: () => void;
  onExit: () => void;
  returnFocus: () => HTMLElement | null | false;
  children: ReactNode;
}) {
  const popup = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root
      open={open}
      disablePointerDismissal
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          if (paused) onContinue();
          else onExit();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Popup
          ref={popup}
          className={`overlay run-overlay ${paused ? `is-paused ${styles.pauseOverlay}` : ''}`}
          aria-labelledby="run-summary-heading"
          aria-describedby="run-summary-metrics"
          initialFocus={() => popup.current?.querySelector<HTMLElement>('h2')}
          finalFocus={returnFocus}
          onKeyDown={(event) => {
            if (event.repeat || event.metaKey || event.ctrlKey || event.altKey)
              return;
            if (
              event.target instanceof HTMLElement &&
              event.target.closest('input, textarea, select')
            )
              return;
            if (
              (paused && event.code === 'KeyP') ||
              (event.code === 'Enter' &&
                event.target instanceof HTMLElement &&
                !event.target.closest('button, a'))
            ) {
              event.preventDefault();
              event.stopPropagation();
              onContinue();
            }
          }}
        >
          <div className={`${styles.shell} ${paused ? styles.pauseShell : ''}`}>
            {children}
            <Dialog.Close
              className="summary-close"
              aria-label={
                paused ? 'Resume climb' : 'Close results and return to title'
              }
            >
              <X size={20} aria-hidden="true" />
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
