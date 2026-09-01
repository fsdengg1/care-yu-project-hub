'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';
import { dedupeByStableId } from '@/lib/people';
import { DailyStatusPerson } from '@/lib/dailyStatus';
import { placeDropdown } from '@/lib/dropdownPlacement';

export default function DependencyMultiSelect({
  people,
  value,
  onChange,
  disabled,
  variant = 'default',
}: {
  people: DailyStatusPerson[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  variant?: 'default' | 'sheet';
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 320, maxHeight: 256 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const unique = useMemo(() => dedupeByStableId(people, (item) => item.id), [people]);
  const selected = unique.filter((item) => value.includes(item.id));
  const filtered = unique.filter((item) =>
    `${item.displayName} ${item.name}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const box = buttonRef.current?.getBoundingClientRect();
      if (!box) return;
      const next = placeDropdown(box, { minWidth: 320, preferredHeight: 256, headerHeight: 48 });
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
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  };

  return (
    <div className={variant === 'sheet' ? 'min-w-0' : 'space-y-2'}>
      {selected.length > 0 && (
        <div className={`flex flex-wrap gap-1 ${variant === 'sheet' ? 'mb-1' : 'gap-1.5'}`}>
          {selected.map((person) => (
            <span
              key={person.id}
              className={variant === 'sheet' ? 'sheet-dep-chip' : 'inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-100'}
            >
              {person.displayName}
              {!disabled && (
                <button type="button" onClick={() => toggle(person.id)} className={variant === 'sheet' ? 'text-[#64748b] hover:text-rose-600' : 'text-slate-400 hover:text-rose-300'}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className={
          variant === 'sheet'
            ? 'inline-flex w-full min-w-0 items-start justify-between gap-1 bg-transparent text-left text-xs leading-snug text-[#0f172a] hover:bg-[#f8fafc] disabled:opacity-80'
            : 'inline-flex min-w-[180px] items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-left text-xs text-slate-200 hover:border-cyan-600 disabled:opacity-50'
        }
      >
        <span className={variant === 'sheet' ? 'min-w-0 wrap-break-word text-[#64748b]' : undefined}>
          {variant === 'sheet' ? (selected.length ? '' : '—') : selected.length ? `${selected.length} selected` : 'Select dependencies'}
        </span>
        {!disabled && <ChevronDown className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${variant === 'sheet' ? 'text-[#64748b]' : 'text-slate-400'}`} />}
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, zIndex: 9999 }}
            className="flex max-h-[min(300px,90vh)] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-xl"
          >
            <div className="relative shrink-0 border-b border-slate-800 p-2">
              <Search className="absolute left-4 top-3.5 h-3.5 w-3.5 text-slate-500" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search employees..."
                className="w-full rounded-md border border-slate-800 bg-slate-950 py-1.5 pl-7 pr-2 text-xs text-slate-100 placeholder-slate-500"
              />
            </div>
            <div className="overflow-y-auto p-1" style={{ maxHeight: coords.maxHeight }}>
              {filtered.map((person) => {
                const checked = value.includes(person.id);
                return (
                  <label
                    key={person.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggle(person.id)} className="accent-cyan-600" />
                    {person.displayName}
                  </label>
                );
              })}
              {filtered.length === 0 && <div className="px-3 py-4 text-center text-xs text-slate-500">No employees found.</div>}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
