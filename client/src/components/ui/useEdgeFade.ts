import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Horizontal scroll rows (tabs, steppers, chip rows): hides the scrollbar via the `.scroll-row` class, fades whichever
 * edge has more content (direction-aware for RTL), and keeps the active item in view.
 * `activeKey` should change whenever the active item changes.
 */
/** Toggle data-fade-start / data-fade-end on a horizontal scroller; returns a cleanup function. */
export function watchEdgeFade(el: HTMLElement): () => void {
  const update = () => {
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft); // RTL scrollLeft runs 0 → -max in current engines
    el.toggleAttribute('data-fade-start', max > 2 && pos > 2);
    el.toggleAttribute('data-fade-end', max > 2 && pos < max - 2);
  };
  update();
  el.addEventListener('scroll', update, { passive: true });
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
  ro?.observe(el);
  if (el.firstElementChild) ro?.observe(el.firstElementChild);
  const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(update) : null; // items added after mount
  mo?.observe(el, { childList: true, subtree: true, characterData: true });
  return () => { el.removeEventListener('scroll', update); ro?.disconnect(); mo?.disconnect(); };
}

export function useEdgeFade<T extends HTMLElement>(activeKey?: unknown) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => (ref.current ? watchEdgeFade(ref.current) : undefined), []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>('[aria-selected="true"],[aria-current="page"],[aria-current="step"]');
    if (!active) return;
    const r = active.getBoundingClientRect();
    const c = el.getBoundingClientRect();
    const pad = 32;
    if (r.left < c.left + pad) el.scrollBy({ left: r.left - c.left - pad });
    else if (r.right > c.right - pad) el.scrollBy({ left: r.right - c.right + pad });
  }, [activeKey]);

  return ref;
}
