'use client';

import { useEffect, useState } from 'react';
import type { TargetAndTransition, Transition, ViewportOptions } from 'framer-motion';

type RevealProps = {
  initial: TargetAndTransition;
  whileInView: TargetAndTransition;
  viewport: ViewportOptions;
  transition?: Transition;
};

/**
 * `true` only AFTER mount on a coarse-pointer (touch) device.
 *
 * Detection runs exclusively inside a `useEffect`, NEVER during render, so the
 * server render and the first client render are identical (`false` on both) and
 * there is zero hydration mismatch. The value flips to `true` immediately after
 * hydration on touch devices.
 *
 * IMPORTANT — do NOT move this detection into render (e.g. a lazy `useState`
 * initializer, `useMemo`, or inline `window.matchMedia(...)`). Reading a
 * client-only value during render is a server/client branch that makes the
 * first client render disagree with the SSR HTML, triggering React's
 * "tree hydrated but attributes didn't match … won't be patched up" error and
 * leaving sections visually broken. Effects only run on the client after
 * hydration, so they cannot cause a mismatch.
 */
export function useIsTouch() {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    setIsTouch(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  return isTouch;
}

const VISIBLE: TargetAndTransition = { opacity: 1, x: 0, y: 0, scale: 1 };

/**
 * Shared viewport config for the scroll-triggered reveal.
 *
 * - `once: true` — the reveal fires a single time, then framer-motion
 *   disconnects the IntersectionObserver, so a section can NEVER re-animate
 *   when you scroll past it again (no replay).
 * - `amount: 0.2` — trigger once ~20% of the element is visible.
 * - `margin: '0px 0px -10% 0px'` — shrink the observer's bottom edge inward by
 *   10% of the viewport so elements begin revealing slightly BEFORE they are
 *   fully scrolled into view. This feels better and reduces the chance of a
 *   section being "caught" mid-fling on iOS momentum scroll.
 */
const VIEWPORT: ViewportOptions = { once: true, amount: 0.2, margin: '0px 0px -10% 0px' };

/**
 * Hydration-safe framer-motion reveal props.
 *
 * The SAME scroll-triggered strategy runs on EVERY device (touch and desktop):
 * the element starts at `initial: hidden` and animates to visible via
 * `whileInView` as it enters the viewport, exactly once.
 *
 * There is no per-device branching at all — the server render and every client
 * render emit identical markup/inline styles, so hydration always matches.
 *
 * Why this is replay-proof and blank-proof:
 *   - `viewport.once === true` reveals each section a single time, then the
 *     observer is torn down → it cannot replay on scroll-up-then-down.
 *   - The negative bottom `margin` reveals slightly before entry, so fast
 *     scrolling is far less likely to outrun the reveal.
 *
 * (We previously used an `animate`-on-mount path on touch under the assumption
 * iOS Safari drops IntersectionObserver callbacks during momentum scroll. The
 * real cause of mobile blanking/"re-animation" was `backdrop-filter` compositor
 * thrash — fixed in globals.css — so the touch-only branch is unnecessary and
 * was hiding the entrance animations by pre-playing them off-screen at mount.)
 *
 * Reduced-motion is honored by the `MotionConfig reducedMotion="user"` wrapper
 * higher in the tree.
 *
 * Pass the hidden state (e.g. `{ opacity: 0, y: 20 }`); the visible state is the
 * neutral, fully-revealed position.
 */
export function useReveal() {
  return (hidden: TargetAndTransition, transition?: Transition): RevealProps => ({
    initial: hidden,
    whileInView: VISIBLE,
    viewport: VIEWPORT,
    transition,
  });
}
