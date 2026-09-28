/**
 * AUX Chart mounts `.aux-grid` as the first SVG child (`insertBefore(firstChild)`),
 * so opaque fills bury the grid. SVG paint order follows DOM order — same idea as
 * Graph#toFront(): move the node later in its parent.
 *
 * Desired sibling order: … graphs … → grid → handles.
 */

export function frontChartGrid(
  svg: SVGSVGElement | null | undefined,
): void {
  if (!svg) return;
  const grid = svg.querySelector(':scope > .aux-grid');
  if (!grid) return;
  const handles = svg.querySelector(':scope > .aux-handles');
  if (handles) {
    if (grid.nextSibling !== handles) svg.insertBefore(grid, handles);
  } else if (svg.lastElementChild !== grid) {
    svg.appendChild(grid);
  }
}

function fixFromNode(node: Node): void {
  if (!(node instanceof Element)) return;
  if (node.matches('svg') && node.parentElement?.classList.contains('aux-chart')) {
    frontChartGrid(node as SVGSVGElement);
    return;
  }
  if (
    node.classList.contains('aux-grid') &&
    node.parentElement instanceof SVGSVGElement
  ) {
    frontChartGrid(node.parentElement);
    return;
  }
  node.querySelectorAll?.('.aux-chart > svg').forEach((el) => {
    frontChartGrid(el as SVGSVGElement);
  });
}

/** Suite-wide: keep AUX chart grids above fills (call once at UI boot). */
export function installChartPaintOrder(
  root: ParentNode = document,
): () => void {
  if (typeof MutationObserver === 'undefined') return () => {};

  const scanRoot =
    root instanceof Document ? root.body ?? root.documentElement : root;
  if (!scanRoot) return () => {};

  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type !== 'childList') continue;
      if (m.target instanceof SVGSVGElement) {
        frontChartGrid(m.target);
        continue;
      }
      for (const n of m.addedNodes) fixFromNode(n);
    }
  });

  mo.observe(scanRoot, { childList: true, subtree: true });
  fixFromNode(scanRoot instanceof Element ? scanRoot : scanRoot);
  return () => mo.disconnect();
}

// Auto-install for every UI entry that pulls theme (Header / main).
if (typeof document !== 'undefined') {
  const boot = () => installChartPaintOrder(document);
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}
