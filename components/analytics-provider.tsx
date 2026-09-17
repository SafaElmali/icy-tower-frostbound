'use client';

import { useEffect } from 'react';
import { initializeAnalytics, trackEvent } from '@/lib/analytics';

export function AnalyticsProvider() {
  useEffect(() => {
    initializeAnalytics();
    const navigation = (event: MouseEvent) => {
      const target =
        event.target instanceof Element ? event.target.closest('a') : null;
      if (!target) return;
      const url = new URL(target.href, window.location.href);
      if (
        url.origin === window.location.origin &&
        ['/', '/race', '/how-to-play'].includes(url.pathname)
      )
        trackEvent('navigation_selected', {
          destination: url.pathname,
          source: window.location.pathname,
        });
    };
    document.addEventListener('click', navigation);
    return () => document.removeEventListener('click', navigation);
  }, []);
  return null;
}
