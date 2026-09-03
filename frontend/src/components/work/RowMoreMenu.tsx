'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import { placeDropdown } from '@/lib/dropdownPlacement';

export type RowMoreMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
};

export default function RowMoreMenu({
  items,
  label = 'More actions',
  variant = 'dark',
}: {
  items: RowMoreMenuItem[];
  label?: string;
  variant?: 'dark' | 'sheet';
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 180, maxHeight: 280 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const enabled = items.filter((item) => !item.disabled);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const box = buttonRef.current?.getBoundingClientRect();
      if (!box) return;
      const next = placeDropdown(box, { minWidth: 200, preferredHeight: 260 });
      setCoords(next);
    };
    place();
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  if (!enabled.length) return null;

  const sheet = variant === 'sheet';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={
          sheet
            ? 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#cbd5e1] bg-white text-[#0f172a] hover:border-[#0f172a]'
            : 'inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700 text-slate-200 hover:border-cyan-600'
        }
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, maxHeight: coords.maxHeight, zIndex: 9999 }}
            className={
              sheet
                ? 'overflow-y-auto rounded-lg border border-[#cbd5e1] bg-white p-1 shadow-xl'
                : 'overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl'
            }
          >
            {enabled.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={`block w-full rounded-md px-2.5 py-1.5 text-left text-[11px] font-semibold ${
                  item.danger
                    ? sheet
                      ? 'text-[#b91c1c] hover:bg-[#fef2f2]'
                      : 'text-rose-200 hover:bg-rose-950'
                    : sheet
                      ? 'text-[#0f172a] hover:bg-[#f8fafc]'
                      : 'text-slate-100 hover:bg-slate-800'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
