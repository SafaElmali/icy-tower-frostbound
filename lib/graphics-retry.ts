/** Explicit recovery preference; never removes challenge or platform parameters. */
export function graphicsRetryUrl(currentUrl: string): string {
  const url = new URL(currentUrl);
  url.searchParams.set('graphics', 'performance');
  return url.toString();
}

export function usesPerformanceGraphics(search: string): boolean {
  return new URLSearchParams(search).get('graphics') === 'performance';
}

export function graphicsFailureMessage(
  code: string,
  performanceMode = false,
): string {
  if (code === 'webgl_unavailable')
    return 'Your browser could not start 3D graphics. Close other games or tabs and try again. If this continues, enable graphics acceleration in your browser settings or try another browser with WebGL 2 support.';
  if (code === 'network_failed')
    return 'The game could not finish downloading. Check your connection, then reload.';
  const nextStep = performanceMode
    ? 'Close other games or tabs, then reload. If this continues, try another browser.'
    : 'Try performance mode to reduce graphics demand.';
  if (code === 'context_recovery_timeout')
    return `Graphics did not reconnect. ${nextStep}`;
  return `The 3D graphics stopped working. ${nextStep}`;
}
