'use client';

import { Check, LockKeyhole, Shirt, Sparkles, HardHat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { COSMETICS, OUTFIT_SLOTS, cosmeticFor, cssColor, isUnlocked, normalizeOutfit, type Outfit, type OutfitSlot, type WardrobeProfile } from '@/lib/outfits';

const labels = { hat: 'Hats', sweater: 'Sweaters', trail: 'Star trails' };
const icons = { hat: HardHat, sweater: Shirt, trail: Sparkles };

export function OutfitBadges({ outfit }: { outfit?: Outfit }) {
  const safe = normalizeOutfit(outfit);
  return <span className="outfit-badges">{OUTFIT_SLOTS.map(slot => {
    const item = cosmeticFor(slot, safe[slot]), Icon = icons[slot];
    return <span key={slot} title={item.name} style={{ color: cssColor(item.colors[0]) }}><Icon size={16} aria-hidden="true" /><span className="sr-only">{item.name}</span></span>;
  })}</span>;
}

export function WardrobeDialog({ open, onOpenChange, profile, onEquip, storageAvailable }: {
  open: boolean; onOpenChange: (open: boolean) => void; profile: WardrobeProfile;
  onEquip: (slot: OutfitSlot, id: string) => void; storageAvailable: boolean;
}) {
  const earned = COSMETICS.filter(item => item.target > 0 && isUnlocked(item, profile.progress)).length;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="wardrobe-card">
    <div className="wardrobe-heading"><span className="eyebrow">EARNED ON THE ASCENT</span><DialogTitle>Your climbing kit.</DialogTitle><DialogDescription>Reach milestones in arcade or practice to unlock new colors.</DialogDescription></div>
    <div className="wardrobe-equipped"><div><span>Equipped</span><OutfitBadges outfit={profile.equipped} /></div><strong>{earned} / 6 rewards unlocked</strong></div>
    <div className="wardrobe-collection">{OUTFIT_SLOTS.map(slot => <section key={slot} aria-labelledby={`wardrobe-${slot}`}><h3 id={`wardrobe-${slot}`}>{labels[slot]}</h3><div className="wardrobe-options">{COSMETICS.filter(item => item.slot === slot).map(item => {
      const unlocked = isUnlocked(item, profile.progress), equipped = profile.equipped[slot] === item.id, Icon = icons[slot];
      return <Button key={item.id} variant="ghost" className={`wardrobe-item ${equipped ? 'is-equipped' : ''}`} disabled={!unlocked} aria-pressed={equipped} onClick={() => onEquip(slot, item.id)} aria-label={`${item.name}. ${unlocked ? equipped ? 'Equipped' : 'Equip' : `Locked. ${item.achievement}`}`}>
        <span className="wardrobe-swatch" style={{ color: cssColor(item.colors[0]) }}><Icon size={32} strokeWidth={1.5} aria-hidden="true" /><span>{item.colors.map(color => <i key={color} style={{ background: cssColor(color) }} />)}</span></span>
        <strong>{item.name}</strong><span className="wardrobe-achievement">{item.achievement}</span>
        <span className="wardrobe-item-status">{equipped ? <><Check size={14} /> Equipped</> : unlocked ? 'Equip' : <><LockKeyhole size={13} /> {Math.min(profile.progress[item.metric], item.target).toLocaleString()} / {item.target.toLocaleString()}</>}</span>
      </Button>;
    })}</div></section>)}</div>
    <p className="wardrobe-note">{storageAvailable ? 'Unlocks and your kit are saved on this browser.' : 'Browser storage is unavailable. Your kit lasts for this session.'} Your equipped kit appears beside new leaderboard scores. Star trails appear during airborne combos of 2× or more.</p>
  </DialogContent></Dialog>;
}
