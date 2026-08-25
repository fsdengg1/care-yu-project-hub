'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

export default function AuthButton({
  children,
  loading = false,
  loadingText,
  variant = 'primary',
  type = 'submit',
  disabled,
  onClick,
  className = '',
}: {
  children: React.ReactNode;
  loading?: boolean;
  loadingText?: string;
  variant?: 'primary' | 'secondary';
  type?: 'button' | 'submit';
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const base = variant === 'primary' ? 'auth-btn-primary' : 'auth-btn-secondary';
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`${base} ${className}`}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {loadingText || children}
        </>
      ) : (
        children
      )}
    </button>
  );
}
