'use client';

import {
  Check,
  LockKeyhole,
  Shirt,
  Sparkles,
  HardHat,
  ArrowRight,
  Ban,
  Bird,
  PersonStanding,
  Crown,
  Fan,
  Flag,
  HatGlasses,
  Moon,
  MountainSnow,
  Ribbon,
  Shield,
  Snowflake,
  WandSparkles,
  type LucideIcon,
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
  equippedId,
  isUnlocked,
  SLOT_DEFAULTS,
  normalizeOutfit,
  type Cosmetic,
  type CosmeticShape,
  type Outfit,
  type OutfitSlot,
  type WardrobeProfile,
} from '@/lib/outfits';
import styles from './wardrobe.module.css';

const labels: Record<OutfitSlot, string> = {
  hat: 'Hats',
  sweater: 'Sweaters',
  accessory: 'Extras',
  trail: 'Star trails',
  climber: 'Climber',
};
/** The climber is picked beside the preview; every other slot gets a tab. */
const TAB_SLOTS = OUTFIT_SLOTS.filter((slot) => slot !== 'climber');
const icons: Record<OutfitSlot, LucideIcon> = {
  hat: HardHat,
  sweater: Shirt,
  accessory: Ribbon,
  trail: Sparkles,
  climber: PersonStanding,
};
const shapeIcons: Record<CosmeticShape, LucideIcon> = {
  bobble: Snowflake,
  crown: Crown,
  'horned-helm': Shield,
  wizard: WandSparkles,
  trapper: MountainSnow,
  propeller: Fan,
  'top-hat': HatGlasses,
  scarf: Ribbon,
  cape: Flag,
  'bat-cape': Moon,
};
const notes: Record<OutfitSlot, string> = {
  hat: 'Hats change your silhouette on every ledge.',
  sweater: 'Equip a color to see it on your climber.',
  accessory: 'Scarves and capes flutter as you run and fall.',
  trail: 'Stars follow airborne combos of 2× or more.',
  climber: 'Every climber plays exactly the same.',
};
const itemIcon = (item: Cosmetic) =>
  item.shape
    ? shapeIcons[item.shape]
    : item.id === 'pip-penguin'
      ? Bird
      : item.slot === 'accessory'
        ? Ban
        : icons[item.slot];

export function OutfitBadges({ outfit }: { outfit?: Outfit }) {
  const safe = normalizeOutfit(outfit);
  return (
    <span className="outfit-badges">
      {OUTFIT_SLOTS.map((slot) => {
        const item = cosmeticFor(slot, equippedId(safe, slot)),
          Icon = itemIcon(item);
        // Older rows have no extra or climber; keep their badges unchanged.
        if (
          (slot === 'accessory' || slot === 'climber') &&
          item.id === SLOT_DEFAULTS[slot]
        )
          return null;
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
            Pick a hat, a cape, your colors. Make your mark on the tower.
          </DialogDescription>
        </header>
        <div className={styles.body}>
          <aside className={styles.preview} aria-label="Equipped character">
            {open && <CharacterPreview outfit={profile.equipped} />}
            <fieldset className={styles.climbers}>
              <legend>{labels.climber}</legend>
              {COSMETICS.filter((item) => item.slot === 'climber').map(
                (item) => {
                  const unlocked = isUnlocked(item, profile.progress);
                  const equipped =
                    equippedId(profile.equipped, 'climber') === item.id;
                  const Icon = itemIcon(item);
                  return (
                    <label
                      key={item.id}
                      className={styles.climber}
                      data-equipped={equipped || undefined}
                      data-locked={!unlocked || undefined}
                    >
                      <input
                        type="radio"
                        name="wardrobe-climber"
                        value={item.id}
                        checked={equipped}
                        disabled={!unlocked}
                        onChange={() => onEquip('climber', item.id)}
                        aria-label={item.name}
                        aria-describedby={`wardrobe-${item.id}-description`}
                      />
                      {unlocked ? (
                        <Icon size={18} aria-hidden="true" />
                      ) : (
                        <LockKeyhole size={16} aria-hidden="true" />
                      )}
                      <span>
                        <strong>{item.name}</strong>
                        <small id={`wardrobe-${item.id}-description`}>
                          {unlocked
                            ? item.achievement.split(' · ')[0]
                            : item.achievement.split(' · ').pop()}
                        </small>
                      </span>
                    </label>
                  );
                },
              )}
              <p>{notes.climber}</p>
            </fieldset>
          </aside>
          <Tabs defaultValue="hat" className={styles.collection}>
            <TabsList aria-label="Outfit category" className={styles.tabs}>
              {TAB_SLOTS.map((slot) => (
                <TabsTrigger key={slot} value={slot}>
                  {labels[slot]}
                </TabsTrigger>
              ))}
            </TabsList>
            {TAB_SLOTS.map((slot) => {
              return (
                <TabsContent key={slot} value={slot} className={styles.panel}>
                  <fieldset className={styles.options}>
                    <legend className="sr-only">
                      Choose {labels[slot].toLowerCase()}
                    </legend>
                    {COSMETICS.filter((item) => item.slot === slot).map(
                      (item) => {
                        const unlocked = isUnlocked(item, profile.progress);
                        const equipped =
                          equippedId(profile.equipped, slot) === item.id;
                        const Icon = itemIcon(item);
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
                  <p className={styles.categoryNote}>{notes[slot]}</p>
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
