/**
 * A leading + trailing-edge throttle utility.
 *
 * Behaviour:
 *  - The first call within a quiet period fires **immediately** (leading edge).
 *  - All subsequent calls within the `delay` window are suppressed, but the
 *    latest arguments are remembered.
 *  - Once the window expires a single **trailing** call fires with those
 *    last-seen arguments, ensuring the final cursor position is always sent.
 *  - `cancel()` clears any pending trailing call without invoking `fn`.
 *
 * Intentionally framework-free so it can be instantiated inside a `useRef`
 * and survive React re-renders without recreating the closure.
 */
export type ThrottledFn<T extends (...args: never[]) => void> = {
  fn: T;
  cancel: () => void;
};

export function throttleTrailing<T extends (...args: never[]) => void>(
  fn: T,
  delay: number,
): ThrottledFn<T> {
  let lastCallTime = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const throttled = (...args: Parameters<T>): void => {
    lastArgs = args;
    const now = Date.now();

    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    const elapsed = now - lastCallTime;
    if (elapsed >= delay) {
      lastCallTime = now;
      fn(...args);
    } else {
      const remaining = delay - elapsed;
      timer = setTimeout(() => {
        lastCallTime = Date.now();
        fn(...(lastArgs as Parameters<T>));
        timer = null;
      }, remaining);
    }
  };

  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return { fn: throttled as T, cancel };
}
