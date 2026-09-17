import type { PostHog } from 'posthog-js';
import { POSTHOG_PUBLIC } from './analytics-config.ts';
import {
  analyticsHost,
  analyticsRoute,
  cleanProperties,
  incomingLink,
  validEvent,
  type AnalyticsProperties,
} from './analytics-policy.ts';

let client: PostHog | undefined;
let initializing = false;
let pageTracked = false;
let initializationAttempts = 0;
let firstVisitAt: Date | undefined;
const pending: {
  event: string;
  properties: AnalyticsProperties;
  timestamp: Date;
}[] = [];
const MAX_PENDING = 100;

export function analyticsId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

function configuration() {
  const env = import.meta.env ?? {};
  const local =
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  return {
    token: (env.VITE_POSTHOG_KEY || POSTHOG_PUBLIC.token) as string,
    host: analyticsHost(env.VITE_POSTHOG_HOST || POSTHOG_PUBLIC.host),
    enabled:
      env.VITE_POSTHOG_ENABLED === undefined
        ? !!env.PROD && !local
        : env.VITE_POSTHOG_ENABLED === 'true',
    environment:
      env.VITE_APP_ENV || (env.PROD && !local ? 'production' : 'development'),
    app_version: env.VITE_APP_VERSION || '0.1.0',
  };
}

function common(): AnalyticsProperties {
  const config = configuration();
  return {
    app: 'frostbound',
    schema_version: 1,
    app_version: config.app_version,
    environment: config.environment,
    surface:
      window.location.pathname === '/race'
        ? 'race'
        : window.location.pathname === '/how-to-play'
          ? 'guide'
          : 'solo',
    device_proxy: window.matchMedia?.('(pointer: coarse)').matches
      ? 'coarse_pointer'
      : 'fine_pointer',
  };
}

export function initializeAnalytics(): void {
  if (
    typeof window === 'undefined' ||
    initializing ||
    client ||
    initializationAttempts >= 2
  )
    return;
  const config = configuration();
  if (
    !config.enabled ||
    !config.host ||
    !config.token ||
    !/^phc_[a-zA-Z0-9]+$/.test(config.token)
  )
    return;
  initializing = true;
  initializationAttempts++;
  firstVisitAt ??= pending[0]?.timestamp ?? new Date();
  void import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(config.token!, {
        api_host: config.host!,
        defaults: '2026-01-30',
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_dead_clicks: false,
        rageclick: false,
        capture_heatmaps: false,
        capture_exceptions: false,
        capture_performance: false,
        disable_session_recording: true,
        disable_surveys: true,
        advanced_disable_flags: true,
        person_profiles: 'never',
        persistence: 'localStorage',
        save_referrer: false,
        save_campaign_params: false,
        before_send: (event) => {
          if (!event || !validEvent(event.event)) return null;
          const props = event.properties;
          const safe = cleanProperties(props);
          // Preserve SDK identity/session fields, but never automatic query strings,
          // referrers, DOM text, initial URLs, or arbitrary person properties.
          for (const key of [
            'distinct_id',
            'token',
            '$device_id',
            '$session_id',
            '$window_id',
            '$lib',
            '$lib_version',
            '$browser',
            '$browser_version',
            '$os',
            '$os_version',
            '$device_type',
            '$is_identified',
            '$process_person_profile',
          ]) {
            if (props[key] !== undefined) safe[key] = props[key];
          }
          safe.$current_url =
            window.location.origin + analyticsRoute(window.location.pathname);
          safe.$pathname = analyticsRoute(window.location.pathname);
          return { ...event, properties: safe };
        },
      });
      client = posthog;
      if (!pageTracked) {
        pageTracked = true;
        posthog.capture(
          '$pageview',
          { ...common(), link_type: incomingLink(window.location.search) },
          { timestamp: firstVisitAt },
        );
      }
      for (const item of pending.splice(0))
        posthog.capture(item.event, item.properties, {
          timestamp: item.timestamp,
        });
    })
    .catch(() => {
      initializing = false;
      pending.length = 0;
    });
}

export function trackEvent(
  event: string,
  properties: AnalyticsProperties = {},
): void {
  if (typeof window === 'undefined' || !validEvent(event)) return;
  try {
    const config = configuration();
    if (!config.enabled || !config.token || !config.host) return;
    const payload = { ...common(), ...cleanProperties(properties) };
    if (client) client.capture(event, payload);
    else {
      if (pending.length < MAX_PENDING)
        pending.push({ event, properties: payload, timestamp: new Date() });
      initializeAnalytics();
    }
  } catch {
    /* Measurement is optional; gameplay must continue. */
  }
}

export function getAnalyticsDistinctId(): string | undefined {
  try {
    return client && !client.has_opted_out_capturing()
      ? client.get_distinct_id()
      : undefined;
  } catch {
    return undefined;
  }
}
