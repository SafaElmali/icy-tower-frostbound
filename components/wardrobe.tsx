'use client';

import {
  Check,
  LockKeyhole,
  Shirt,
  Sparkles,
  HardHat,
  ArrowRight,
} from 'lucide-react';
import { CharacterPreview } from '@/components/wardrobe-preview';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  COSMETICS,
  OUTFIT_SLOTS,
  cosmeticFor,
  cssColor,
  isUnlocked,
  normalizeOutfit,
  type Outfit,
  type OutfitSlot,
  type WardrobeProfile,
} from '@/lib/outfits';
import styles from './wardrobe.module.css';

const labels = { hat: 'Hats', sweater: 'Sweaters', trail: 'Star trails' };
const icons = { hat: HardHat, sweater: Shirt, trail: Sparkles };

export function OutfitBadges({ outfit }: { outfit?: Outfit }) {
  const safe = normalizeOutfit(outfit);
  return (
    <span className="outfit-badges">
      {OUTFIT_SLOTS.map((slot) => {
        const item = cosmeticFor(slot, safe[slot]),
          Icon = icons[slot];
        return (
          <span
            key={slot}
            title={item.name}
            style={{ color: cssColor(item.colors[0]) }}
          >
            <Icon size={16} aria-hidden="true" />
            <span className="sr-only">{item.name}</span>
          </span>
        );
      })}
    </span>
  );
}

export function WardrobeDialog({
  open,
  onOpenChange,
  profile,
  onEquip,
  storageAvailable,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: WardrobeProfile;
  onEquip: (slot: OutfitSlot, id: string) => void;
  storageAvailable: boolean;
}) {
  const rewards = COSMETICS.filter((item) => item.target > 0);
  const earned = rewards.filter((item) =>
    isUnlocked(item, profile.progress),
  ).length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.card}>
        <header className={styles.header}>
          <DialogTitle>Make it yours.</DialogTitle>
          <DialogDescription>
            Pick your colors. Make your mark on the tower.
          </DialogDescription>
        </header>
        <div className={styles.body}>
          <aside className={styles.preview} aria-label="Equipped character">
            {open && <CharacterPreview outfit={profile.equipped} />}
          </aside>
          <Tabs defaultValue="hat" className={styles.collection}>
            <TabsList aria-label="Outfit category" className={styles.tabs}>
              {OUTFIT_SLOTS.map((slot) => (
                <TabsTrigger key={slot} value={slot}>
                  {labels[slot]}
                </TabsTrigger>
              ))}
            </TabsList>
            {OUTFIT_SLOTS.map((slot) => {
              const Icon = icons[slot];
              return (
                <TabsContent key={slot} value={slot} className={styles.panel}>
                  <fieldset className={styles.options}>
                    <legend className="sr-only">
                      Choose {labels[slot].toLowerCase()}
                    </legend>
                    {COSMETICS.filter((item) => item.slot === slot).map(
                      (item) => {
                        const unlocked = isUnlocked(item, profile.progress);
                        const equipped = profile.equipped[slot] === item.id;
                        const progress = Math.min(
                          profile.progress[item.metric],
                          item.target,
                        );
                        return (
                          <label
                            key={item.id}
                            className={styles.option}
                            data-equipped={equipped || undefined}
                            data-locked={!unlocked || undefined}
                          >
                            <input
                              type="radio"
                              name={`wardrobe-${slot}`}
                              value={item.id}
                              checked={equipped}
                              disabled={!unlocked}
                              onChange={() => onEquip(slot, item.id)}
                              aria-label={item.name}
                              aria-describedby={`wardrobe-${item.id}-description`}
                            />
                            <span className={styles.swatch} aria-hidden="true">
                              <Icon
                                size={27}
                                strokeWidth={1.5}
                                style={{ color: cssColor(item.colors[0]) }}
                              />
                              <span>
                                {item.colors.map((color) => (
                                  <i
                                    key={color}
                                    style={{ background: cssColor(color) }}
                                  />
                                ))}
                              </span>
                            </span>
                            <span className={styles.itemCopy}>
                              <strong>{item.name}</strong>
                              <span id={`wardrobe-${item.id}-description`}>
                                {item.achievement}
                              </span>
                              {!unlocked && (
                                <progress
                                  value={progress}
                                  max={item.target}
                                  aria-label={`${item.name} unlock progress`}
                                />
                              )}
                            </span>
                            <span className={styles.itemState}>
                              {equipped ? (
                                <>
                                  <Check size={17} aria-hidden="true" />
                                  <span>Equipped</span>
                                </>
                              ) : unlocked ? (
                                <span>Equip</span>
                              ) : (
                                <>
                                  <LockKeyhole size={15} aria-hidden="true" />
                                  <span>
                                    {progress.toLocaleString()} /{' '}
                                    {item.target.toLocaleString()}
                                  </span>
                                </>
                              )}
                            </span>
                          </label>
                        );
                      },
                    )}
                  </fieldset>
                  <p className={styles.categoryNote}>
                    {slot === 'trail'
                      ? 'Stars follow airborne combos of 2× or more.'
                      : 'Equip a color to see it on your climber.'}
                  </p>
                </TabsContent>
              );
            })}
            <p className={styles.progressNote}>
              <Sparkles size={15} aria-hidden="true" />
              <span>
                <strong>
                  {earned} / {rewards.length}
                </strong>{' '}
                rewards unlocked in Classic, Party, or Practice.
              </span>
            </p>
          </Tabs>
        </div>
        <footer className={styles.footer}>
          <p>
            {storageAvailable
              ? 'Your kit saves automatically on this browser.'
              : 'Storage is unavailable. Your kit lasts for this session.'}
            <span>Shown beside your new leaderboard scores.</span>
          </p>
          <Button onClick={() => onOpenChange(false)}>
            Done <ArrowRight size={18} aria-hidden="true" />
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
