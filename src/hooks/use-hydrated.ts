import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * False in the server HTML and until the page's JavaScript has loaded. Buttons that only work
 * with JavaScript stay disabled until then, so an early tap on a slow phone isn't silently lost.
 */
export function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
