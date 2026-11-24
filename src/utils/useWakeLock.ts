import { useEffect } from 'react';
import { holdScreenAwake, wakeLockSupported } from './wakeLock';

/** Keeps the screen on while `active`. Returns whether this browser can do it at all. */
export function useWakeLock(active: boolean): boolean {
  useEffect(() => {
    if (!active) return;
    return holdScreenAwake().stop;
  }, [active]);
  return wakeLockSupported();
}
