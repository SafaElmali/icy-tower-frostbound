'use client';

import { MODE_LABELS } from '@/lib/tower-engine';
import { useState } from 'react';
import { Copy, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { challengeText, type FriendChallenge } from '@/lib/friend-challenge';

export function FriendChallengeDialog({ challenge, url, onClose }: { challenge: FriendChallenge; url: string; onClose: () => void }) {
  const [message, setMessage] = useState('');
  const [sharing, setSharing] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Challenge link copied. Send it to a friend!');
    } catch {
      setMessage('Select the link below and copy it to send to a friend.');
    }
  }
  async function share() {
    if (!navigator.share) { await copy(); return; }
    setSharing(true);
    try {
      await navigator.share({ title: `Beat my floor ${challenge.floor}`, text: challengeText(challenge), url });
      setMessage('Challenge shared.');
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) await copy();
    } finally { setSharing(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="friend-share-card">
      <Share2 size={28} />
      <DialogTitle>Beat my floor {challenge.floor}.</DialogTitle>
      <DialogDescription>{challenge.score.toLocaleString()} points · {MODE_LABELS[challenge.mode]}. Your friend gets the same tower. How high can they climb?</DialogDescription>
      <div className="friend-share-actions">
        <Button onClick={() => void share()} disabled={sharing}><Share2 size={16} /> Share challenge</Button>
        <Button variant="outline" onClick={() => void copy()}><Copy size={16} /> Copy link</Button>
      </div>
      <label htmlFor="friend-challenge-link">Challenge link</label>
      <Input id="friend-challenge-link" readOnly value={url} onFocus={event => event.currentTarget.select()} />
      <output className="friend-share-status">{message || 'Share the link, or select it to copy manually.'}</output>
    </DialogContent>
  </Dialog>;
}
