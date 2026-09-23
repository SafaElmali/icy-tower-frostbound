'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cosmeticFor, equippedId, SLOT_DEFAULTS, type Outfit } from '@/lib/outfits';
import type { WardrobePreview } from '@/lib/wardrobe-preview';

export function CharacterPreview({ outfit }: { outfit: Outfit }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const preview = useRef<WardrobePreview | null>(null);
  const latestOutfit = useRef(outfit);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [playing, setPlaying] = useState(() => typeof window === 'undefined' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const latestPlaying = useRef(playing);
  const accessory = equippedId(outfit, 'accessory'), climber = equippedId(outfit, 'climber');
  const description = [...(climber === SLOT_DEFAULTS.climber ? [] : [cosmeticFor('climber', climber).name]), cosmeticFor('hat', outfit.hat).name, cosmeticFor('sweater', outfit.sweater).name, ...(accessory === SLOT_DEFAULTS.accessory ? [] : [cosmeticFor('accessory', accessory).name]), cosmeticFor('trail', outfit.trail).name].join(', ');

  useEffect(() => {
    latestOutfit.current = outfit;
    preview.current?.setOutfit(outfit);
  }, [outfit]);

  useEffect(() => {
    latestPlaying.current = playing;
    preview.current?.setPlaying(playing);
  }, [playing]);

  useEffect(() => {
    let disposed = false;
    void import('@/lib/wardrobe-preview').then(async ({ WardrobePreview }) => {
      if (disposed || !canvas.current) return;
      const view = new WardrobePreview(canvas.current, latestOutfit.current);
      preview.current = view;
      view.setPlaying(latestPlaying.current);
      await view.load();
      if (!disposed) setStatus('ready');
    }).catch(() => {
      if (!disposed) {
        preview.current?.dispose(); preview.current = null;
        setStatus('error');
      }
    });
    return () => { disposed = true; preview.current?.dispose(); preview.current = null; };
  }, []);

  return <figure className="wardrobe-preview">
    <div className="wardrobe-preview-stage">
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- WebGL content must use a canvas; img cannot host the live renderer. */}
      <canvas ref={canvas} role="img" aria-label={`Character wearing ${description}`} />
      {status !== 'ready' && <output>{status === 'loading' ? 'Loading your climber…' : 'Preview unavailable. You can still equip your kit.'}</output>}
    </div>
    <figcaption><strong>Your climber</strong><span aria-live="polite">{description}</span><Button className="preview-playback" variant="ghost" disabled={status !== 'ready'} onClick={() => setPlaying(value => !value)}>{playing ? <Pause size={14} /> : <Play size={14} />}{playing ? 'Pause preview' : 'Play preview'}</Button></figcaption>
  </figure>;
}
