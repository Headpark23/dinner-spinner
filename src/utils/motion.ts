export type MotionMatcher = (query: string) => { matches: boolean };

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export const prefersReducedMotion = (
  matcher: MotionMatcher | undefined =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia.bind(window)
      : undefined
) => Boolean(matcher?.(REDUCED_MOTION_QUERY).matches);

export const getSpinMotionPlan = (durationMs: number, reduceMotion: boolean) => ({
  durationMs: reduceMotion ? 0 : durationMs,
  tickIntervalMs: reduceMotion ? null : 90,
  animateLever: !reduceMotion,
});
