import React from 'react';

export const metadata = {
  title: 'Sign In — Careyu Automation',
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F4F7FB] text-slate-900 antialiased">
      {children}
    </div>
  );
}
