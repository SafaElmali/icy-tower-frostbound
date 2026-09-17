/** Public ingestion settings, verified against the Frostbound PostHog project.
 * A project token is shipped to browsers; never put a personal API key here.
 */
export const POSTHOG_PUBLIC = {
  projectId: 612024,
  token: 'phc_x55t2N4oW2S7iZcQoUv6keFZX434M9a5CJSGF5evfcve',
  host: 'https://us.i.posthog.com',
} as const;
