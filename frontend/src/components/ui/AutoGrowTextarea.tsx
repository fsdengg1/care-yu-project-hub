'use client';

import React, { useEffect, useRef } from 'react';

export const AUTO_GROW_DEFAULT_HEIGHT = 64;
export const AUTO_GROW_COMPACT_HEIGHT = 44;

export function measureAutoGrowHeight(el: HTMLTextAreaElement, minHeight: number): number {
  el.style.height = '0px';
  return Math.max(minHeight, el.scrollHeight);
}

export function applyAutoGrowHeight(el: HTMLTextAreaElement | null, minHeight: number) {
  if (!el) return;
  el.style.height = `${measureAutoGrowHeight(el, minHeight)}px`;
}

export function resetAutoGrowHeight(el: HTMLTextAreaElement | null, minHeight: number) {
  if (!el) return;
  el.style.height = `${minHeight}px`;
}

type AutoGrowTextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> & {
  minHeight?: number;
  resetToken?: number;
};

export default function AutoGrowTextarea({
  minHeight = AUTO_GROW_DEFAULT_HEIGHT,
  resetToken = 0,
  className = '',
  value = '',
  readOnly = false,
  onChange,
  onInput,
  onFocus,
  ...rest
}: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const isEditingRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (readOnly) {
      applyAutoGrowHeight(el, minHeight);
      return;
    }
    if (isEditingRef.current) {
      applyAutoGrowHeight(el, minHeight);
    } else {
      resetAutoGrowHeight(el, minHeight);
    }
  }, [value, minHeight, readOnly]);

  useEffect(() => {
    isEditingRef.current = false;
    resetAutoGrowHeight(ref.current, minHeight);
  }, [resetToken, minHeight]);

  return (
    <textarea
      ref={ref}
      value={value}
      readOnly={readOnly}
      onChange={onChange}
      onInput={(event) => {
        isEditingRef.current = true;
        applyAutoGrowHeight(event.currentTarget, minHeight);
        onInput?.(event);
      }}
      onFocus={(event) => {
        isEditingRef.current = true;
        applyAutoGrowHeight(event.currentTarget, minHeight);
        onFocus?.(event);
      }}
      className={`auto-grow-textarea form-control ${className}`.trim()}
      style={{ height: `${minHeight}px` }}
      {...rest}
    />
  );
}
