import React from 'react';
import '@/components/auth/auth.css';

export const metadata = {
  title: 'Authentication — CareYu Automation',
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="auth-surface min-h-dvh antialiased">{children}</div>;
}
