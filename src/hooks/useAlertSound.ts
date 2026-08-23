import { useCallback } from 'react';

/** Sound stub — wire to an <audio> source later (future requirement). */
export const useAlertSound = () => {
  const play = useCallback((_kind: 'alert' | 'warning' | 'success') => {
    // no-op placeholder
  }, []);
  return { play };
};