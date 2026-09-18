'use client';

import { useRef } from 'react';
import {
  ArrowLeftRight,
  ArrowUp,
  ArrowRight,
  BookOpen,
  ChevronDown,
  CornerUpRight,
  Footprints,
  Ghost,
  Link2,
  PartyPopper,
  Pause,
  Snowflake,
  TriangleAlert,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import styles from './how-to-play-dialog.module.css';

const mechanics = [
  {
    id: 'walls',
    Icon: CornerUpRight,
    title: 'Jump from the walls',
    tip: 'Release, then jump beside a wall to push up and away.',
    detail:
      'This works even at low speed. Land on a platform or jump from the opposite wall before boosting from the same wall again. Fast automatic rebounds still work.',
    badge: 'A second chance',
  },
  {
    id: 'combo',
    Icon: Link2,
    title: 'Keep your chain alive',
    tip: 'Reach a new higher floor within 3.8 seconds.',
    detail:
      'Keep landing on higher floors to continue your combo and leave a colorful star trail. Collect crystals and skip floors to raise your score.',
    badge: '3.8-second window',
  },
  {
    id: 'frost',
    Icon: Snowflake,
    title: 'Stay above the frost',
    tip: 'From floor 5, the tower starts scrolling. Keep climbing.',
    detail:
      'The frost speeds up every 30 seconds and every 50 floors. Regular ledges also narrow at each 50-floor milestone; full-width stages give you room to prepare. Time and pace appear below your score. Pausing freezes both. Practice removes the automatic chase, but falling into the frost still ends your run.',
    badge: 'Starts at floor 5',
  },
  {
    id: 'hazards',
    Icon: TriangleAlert,
    title: 'Read the danger',
    tip: 'Cracked ledges, falling icicles, and bats keep you moving.',
    detail:
      'Cracked ledges crumble about a second after landing, so jump away. Icicles have no landing markers and bats have no spawn warnings. They appear more often higher up and can arrive together. Land on a bat from above for a powerful bounce and bonus points. Side hits knock you back, with a brief recovery window.',
    badge: 'Watch your footing',
  },
  {
    id: 'frenzy',
    Icon: Zap,
    title: 'Earn a frenzy',
    tip: 'Chain 10 new floors for six seconds of boosted jumps.',
    detail:
      'Frenzy adds bonus crystal trails. Keep your combo alive to recharge after it ends. Higher up, brief ice showers and collapsing stairs test your reflexes, followed by breathing room. Your movement and jump controls stay the same.',
    badge: '10 floors → 6-second boost',
  },
  {
    id: 'party',
    Icon: PartyPopper,
    title: 'Take it to Party mode',
    tip: 'Low gravity, spring platforms, and midair double jumps.',
    detail:
      'Pink spring platforms launch you automatically. Collect a pink crystal for eight seconds of double jumps: release and press jump again in midair, once per landing. Party has its own rankings and personal best.',
    badge: '8-second crystal power',
  },
  {
    id: 'ghost',
    Icon: Ghost,
    title: 'Race your ghost',
    tip: 'Your best Classic climb becomes a rival to chase.',
    detail:
      'Your highest completed Classic climb returns as a translucent rival on the same tower. Score, then time, break floor ties. Ghosts are saved in this browser; Party and Practice runs do not replace them.',
    badge: 'Beat your own best',
  },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ready: boolean;
  active: boolean;
  onPractice: () => void;
  onPlay: () => void;
  onMeasurements: () => void;
};

export function HowToPlayDialog({
  open,
  onOpenChange,
  ready,
  active,
  onPractice,
  onPlay,
  onMeasurements,
}: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.dialog} initialFocus={titleRef}>
        <header className={styles.header}>
          <span className={styles.eyebrow}>
            <BookOpen aria-hidden="true" /> THE ART OF THE ASCENT
          </span>
          <DialogTitle className={styles.title} ref={titleRef} tabIndex={-1}>
            Find your rhythm.
          </DialogTitle>
          <DialogDescription className={styles.description}>
            Build momentum. Chain your jumps. Outrun the frost.
          </DialogDescription>
        </header>
        <div className={styles.body}>
          <section aria-labelledby="guide-controls-heading">
            <h3 className={styles.sectionTitle} id="guide-controls-heading">
              Start with the basics
            </h3>
            <div className={styles.controls}>
              <article>
                <div className={styles.controlHeading}>
                  <ArrowLeftRight aria-hidden="true" />
                  <h4>Move</h4>
                </div>
                <div className={styles.keys}>
                  <kbd>A</kbd>
                  <kbd>D</kbd>
                  <span>or</span>
                  <kbd>←</kbd>
                  <kbd>→</kbd>
                </div>
                <p>
                  Hold a direction to build speed. Ice is slippery—steer early.
                </p>
              </article>
              <article>
                <div className={styles.controlHeading}>
                  <ArrowUp aria-hidden="true" />
                  <h4>Jump</h4>
                </div>
                <div className={styles.keys}>
                  <kbd>Space</kbd>
                  <span>/</span>
                  <kbd>W</kbd>
                  <span>/</span>
                  <kbd>↑</kbd>
                </div>
                <p>Release before each jump. More speed means more height.</p>
              </article>
              <article>
                <div className={styles.controlHeading}>
                  <Pause aria-hidden="true" />
                  <h4>Pause</h4>
                </div>
                <div className={styles.keys}>
                  <kbd>Esc</kbd>
                  <span>or</span>
                  <kbd>P</kbd>
                </div>
                <p>Take a breath. Your climb and the frost wait for you.</p>
              </article>
            </div>
            <p className={styles.touchTip}>
              <strong>On a touch screen</strong> Hold a direction with one thumb
              and tap JUMP with the other. Release and tap again for your next
              jump. Slide across the direction pad to turn; use Menu to pause.
            </p>
          </section>

          <section
            className={styles.mechanics}
            aria-labelledby="guide-mechanics-heading"
          >
            <div className={styles.sectionHeading}>
              <h3 className={styles.sectionTitle} id="guide-mechanics-heading">
                Make every jump count
              </h3>
              <span>Open a tip to learn more</span>
            </div>
            {mechanics.map(({ id, Icon, title, tip, detail, badge }) => (
              <details key={id} className={styles.mechanic} data-mechanic={id}>
                <summary>
                  <span className={styles.icon}>
                    <Icon aria-hidden="true" />
                  </span>
                  <span className={styles.summaryText}>
                    <strong>{title}</strong>
                    <span>{tip}</span>
                  </span>
                  <ChevronDown className={styles.chevron} aria-hidden="true" />
                </summary>
                <div className={styles.detail}>
                  <span className={styles.badge}>{badge}</span>
                  <p>{detail}</p>
                </div>
              </details>
            ))}
          </section>

          <p className={styles.note}>
            Older friend challenges and dated towers keep their original rules
            and pace.
          </p>
          <div className={styles.more}>
            {/* Full navigation is required by the Netlify static export. */}
            {/* oxlint-disable-next-line next/no-html-link-for-pages */}
            <a href="/how-to-play">
              Full gameplay guide <ArrowRight aria-hidden="true" />
            </a>
            <Button variant="ghost" onClick={onMeasurements}>
              Playtest measurements
            </Button>
          </div>
        </div>
        <footer className={styles.footer}>
          <Button
            variant="ghost"
            className={styles.practice}
            disabled={!ready}
            onClick={onPractice}
          >
            <Footprints aria-hidden="true" />
            Try guided practice
          </Button>
          <Button
            className={styles.play}
            disabled={!active && !ready}
            onClick={active ? () => onOpenChange(false) : onPlay}
          >
            {active ? 'Back to game' : 'Let’s climb'}
            <ArrowRight aria-hidden="true" />
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
