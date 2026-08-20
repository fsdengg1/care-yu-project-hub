import React from 'react';
import Link from 'next/link';
import CareyuLogo from '@/components/brand/CareyuLogo';

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[440px]">
        <div className="mb-8">
          <CareyuLogo />
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-8 shadow-[0_12px_40px_rgba(15,36,68,0.08)]">
          <h1 className="text-2xl font-semibold tracking-tight text-[#0B1F3A]">Forgot Password</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Password resets are handled by your system administrator. Contact Admin to restore access to
            your Careyu Automation account.
          </p>
          <a
            href="mailto:admin@careyu.com"
            className="mt-6 flex w-full items-center justify-center rounded-xl bg-[#1D4ED8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1E40AF]"
          >
            Contact Admin
          </a>
          <Link
            href="/login"
            className="mt-4 block text-center text-sm font-medium text-[#1D4ED8] hover:text-[#1E40AF]"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
