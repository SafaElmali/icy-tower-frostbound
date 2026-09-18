/** Classify known failures without sending exception messages, URLs, or stacks. */
export function graphicsFailureCode(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (/creating WebGL context|WebGL 1 is not supported/i.test(error.message))
    return 'webgl_unavailable';
  if (error.name === 'AbortError') return 'load_aborted';
  if (error instanceof RangeError && /array buffer|allocation|memory/i.test(error.message))
    return 'allocation_failed';
  if (/Failed to fetch|Load failed|NetworkError|dynamically imported module|Importing a module script failed/i.test(error.message))
    return 'network_failed';
  return fallback;
}
