export type DropdownCoords = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

export function placeDropdown(
  anchor: DOMRect,
  options?: { minWidth?: number; preferredHeight?: number; gap?: number; headerHeight?: number }
): DropdownCoords {
  const minWidth = options?.minWidth ?? 160;
  const preferredHeight = options?.preferredHeight ?? 280;
  const headerHeight = options?.headerHeight ?? 0;
  const gap = options?.gap ?? 6;
  const width = Math.max(anchor.width, minWidth);
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const spaceBelow = viewportH - anchor.bottom - gap;
  const spaceAbove = anchor.top - gap;
  const totalPreferred = preferredHeight + headerHeight;
  const flip = spaceBelow < totalPreferred && spaceAbove > spaceBelow;
  const maxHeight = Math.max(100, Math.min(preferredHeight, (flip ? spaceAbove : spaceBelow) - headerHeight - 8));
  const totalHeight = headerHeight + maxHeight;
  const top = flip
    ? Math.max(8, anchor.top - gap - totalHeight)
    : Math.min(anchor.bottom + gap, viewportH - totalHeight - 8);
  let left = anchor.left;
  if (left + width > viewportW - 8) left = Math.max(8, viewportW - width - 8);
  return { top, left, width, maxHeight };
}
