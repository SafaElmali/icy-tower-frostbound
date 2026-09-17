import { createHash, randomUUID } from 'node:crypto';
import { POSTHOG_PUBLIC } from './analytics-config.ts';
import {
  analyticsHost,
  cleanProperties,
  validEvent,
  type AnalyticsProperties,
} from './analytics-policy.ts';

export function serverEventId(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Bounded, best-effort delivery. Never exposes a personal/admin API key. */
export async function captureServerEvent(
  event: string,
  distinctId: string,
  properties: AnalyticsProperties = {},
  eventId?: string,
): Promise<void> {
  const token =
    process.env.POSTHOG_KEY ??
    process.env.VITE_POSTHOG_KEY ??
    POSTHOG_PUBLIC.token;
  const host = analyticsHost(
    process.env.POSTHOG_HOST ??
      process.env.VITE_POSTHOG_HOST ??
      POSTHOG_PUBLIC.host,
  );
  const deployed =
    process.env.NODE_ENV === 'production' ||
    !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const enabled =
    process.env.POSTHOG_ENABLED ??
    process.env.VITE_POSTHOG_ENABLED ??
    String(deployed);
  if (
    enabled !== 'true' ||
    !host ||
    !token ||
    !/^phc_[a-zA-Z0-9]+$/.test(token) ||
    !validEvent(event)
  )
    return;
  if (!/^[a-zA-Z0-9:$_.-]{1,200}$/.test(distinctId)) return;
  try {
    await fetch(`${host}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(1000),
      body: JSON.stringify({
        api_key: token,
        event,
        uuid: eventId ? serverEventId(eventId) : randomUUID(),
        properties: {
          ...cleanProperties(properties),
          distinct_id: distinctId,
          $process_person_profile: false,
          $geoip_disable: true,
          app: 'frostbound',
          schema_version: 1,
          app_version:
            process.env.VITE_APP_VERSION ?? process.env.COMMIT_REF ?? '0.1.0',
          environment:
            process.env.VITE_APP_ENV ?? process.env.CONTEXT ?? 'production',
          result_source: 'server',
        },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    /* Telemetry must not reject a verified score or race result. */
  }
}
