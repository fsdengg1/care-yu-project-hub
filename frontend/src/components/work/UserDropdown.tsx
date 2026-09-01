'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';
import { dedupeByStableId } from '@/lib/people';
import { DailyStatusPerson } from '@/lib/dailyStatus';

export default function UserDropdown({
  people,
  value,
  onChange,
  placeholder = 'Select a person',
  disabled,
  variant = 'default',
}: {
  people: DailyStatusPerson[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  variant?: 'default' | 'sheet';
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 280 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const unique = useMemo(() => dedupeByStableId(people, (item) => item.id), [people]);
  const selected = unique.find((item) => item.id === value);
  const filtered = unique.filter((item) =>
    `${item.displayName} ${item.name} ${item.email}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const box = buttonRef.current?.getBoundingClientRect();
      if (!box) return;
      setCoords({ top: box.bottom + 6, left: box.left, width: Math.max(box.width, 280) });
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

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className={
          variant === 'sheet'
            ? 'inline-flex w-full items-center justify-start gap-1 bg-transparent text-left text-xs font-semibold text-[#0f172a] hover:bg-[#f8fafc] disabled:opacity-80'
            : 'inline-flex min-w-[180px] items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-left text-xs font-medium text-slate-100 hover:border-cyan-600 disabled:opacity-50'
        }
      >
        <span className={variant === 'sheet' ? 'text-[#0f172a]' : selected ? 'text-slate-100' : 'text-slate-500'}>
          {selected?.displayName || placeholder}
        </span>
        {!disabled && <ChevronDown className={`h-3.5 w-3.5 ${variant === 'sheet' ? 'text-[#64748b]' : 'text-slate-400'}`} />}
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, zIndex: 80 }}
            className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-xl"
          >
            <div className="relative border-b border-slate-800 p-2">
              <Search className="absolute left-4 top-3.5 h-3.5 w-3.5 text-slate-500" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search employees..."
                className="w-full rounded-md border border-slate-800 bg-slate-950 py-1.5 pl-7 pr-2 text-xs text-slate-100 placeholder-slate-500"
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {filtered.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => {
                    onChange(person.id);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-800 ${
                    person.id === value ? 'bg-cyan-950 text-cyan-200' : 'text-slate-200'
                  }`}
                >
                  {person.displayName}
                </button>
              ))}
              {filtered.length === 0 && <div className="px-3 py-4 text-center text-xs text-slate-500">No employees found.</div>}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
