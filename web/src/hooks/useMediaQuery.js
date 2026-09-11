import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query. SSR-safe (defaults to false when window is undefined).
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mql = window.matchMedia(query);
    const handler = () => setMatches(mql.matches);
    handler();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

export const MOBILE_MAX_WIDTH_PX = 767;

/**
 * Phones in landscape often report width > 767 (e.g. ~844×390), which would
 * otherwise flip Vettr into desktop chrome. Treat short landscape viewports
 * as mobile so rotation does not reshape the feed.
 * Keep in sync with the matching CSS media queries in global.css.
 */
export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_MAX_WIDTH_PX}px), (max-width: 950px) and (max-height: 500px) and (orientation: landscape)`;

export function useIsMobile() {
  return useMediaQuery(MOBILE_MEDIA_QUERY);
}

/** Sync check for cold-load defaults (no React subscription). */
export function matchesMobileViewport() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

export function useIsTablet() {
  return useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
}

export function useIsDesktop() {
  return useMediaQuery('(min-width: 1024px)');
}

export function useOrientation() {
  const isPortrait = useMediaQuery('(orientation: portrait)');
  const isLandscape = useMediaQuery('(orientation: landscape)');
  return { isPortrait, isLandscape };
}

/** Start of local calendar day as ISO string (for daily deck filter). */
export function startOfLocalDayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
