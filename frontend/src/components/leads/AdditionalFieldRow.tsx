'use client';

import React from 'react';
import { X } from 'lucide-react';
import { LeadCustomField } from '@/lib/types';

export default function AdditionalFieldRow({
  field,
  onChange,
  onRemove,
}: {
  field: LeadCustomField;
  onChange: (field: LeadCustomField) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
      <label className="block">
        <span className="mb-1 block font-medium text-slate-400">Field Name</span>
        <input
          value={field.name}
          onChange={(event) => onChange({ ...field, name: event.target.value })}
          placeholder="e.g. Machine Type"
          className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500"
        />
      </label>
      <label className="block">
        <span className="mb-1 block font-medium text-slate-400">Field Value</span>
        <input
          value={field.value}
          onChange={(event) => onChange({ ...field, value: event.target.value })}
          placeholder="e.g. Vision Inspection System"
          className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500"
        />
      </label>
      <button
        type="button"
        onClick={onRemove}
        className="mb-0.5 inline-flex h-9 w-9 items-center justify-center rounded border border-rose-900 text-rose-300 hover:bg-rose-950"
        aria-label="Remove additional field"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
