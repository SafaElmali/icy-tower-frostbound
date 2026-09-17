'use client';

import { MODE_LABELS } from '@/lib/tower-engine';
import { useEffect, useRef, useState } from 'react';
import { Copy, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { challengeText, type FriendChallenge } from '@/lib/friend-challenge';
import { analyticsId, trackEvent } from '@/lib/analytics';

export function FriendChallengeDialog({ challenge, url, onClose, runId }: { challenge: FriendChallenge; url: string; onClose: () => void; runId?: string }) {
  const [message, setMessage] = useState('');
  const [sharing, setSharing] = useState(false);
  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    trackEvent('share_dialog_opened', { surface: 'solo', share_type: 'friend_challenge', run_id: runId, source: 'results', mode: challenge.mode });
  }, [challenge.mode, runId]);
  async function copy(fallbackReason?: string, parentOperationId?: string) {
    const properties = { surface: 'solo', share_type: 'friend_challenge', run_id: runId, method: 'clipboard', operation_id: analyticsId(), fallback_reason: fallbackReason, parent_operation_id: parentOperationId };
    trackEvent('share_attempted', properties);
    try {
      await navigator.clipboard.writeText(url);
      trackEvent('share_completed', properties);
      setMessage('Challenge link copied. Send it to a friend!');
    } catch {
      trackEvent('share_failed', { ...properties, error_code: navigator.clipboard ? 'clipboard_failed' : 'clipboard_unavailable' });
      setMessage('Select the link below and copy it to send to a friend.');
    }
  }
  async function share() {
    if (!navigator.share) { await copy('native_unavailable'); return; }
    setSharing(true);
    const properties = { surface: 'solo', share_type: 'friend_challenge', run_id: runId, method: 'native', operation_id: analyticsId() };
    trackEvent('share_attempted', properties);
    try {
      await navigator.share({ title: `Beat my floor ${challenge.floor}`, text: challengeText(challenge), url });
      trackEvent('share_completed', properties);
      setMessage('Challenge shared.');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        trackEvent('share_cancelled', { ...properties, error_code: 'user_cancelled' });
      } else {
        trackEvent('share_failed', { ...properties, error_code: 'native_failed' });
        await copy('native_failed', properties.operation_id);
      }
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
