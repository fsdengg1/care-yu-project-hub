'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, AlertCircle, Mail, Lock } from 'lucide-react';
import CareyuLogo from '@/components/brand/CareyuLogo';
import ExecutionFlow from '@/components/auth/ExecutionFlow';
import { loginWithApi, getDashboardPath, validateLogin, LoginFieldErrors } from '@/lib/auth';
import { StorageService } from '@/lib/storage';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const existing = StorageService.getCurrentUser();
    if (existing) {
      router.replace(getDashboardPath(existing.role_code));
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const errors = validateLogin(email, password);
    setFieldErrors(errors);
    if (errors.email || errors.password) return;

    setLoading(true);

    const result = await loginWithApi(email, password);
    if (!result.ok) {
      setLoading(false);
      setFormError(result.error);
      return;
    }

    StorageService.setAuthToken(result.token, rememberMe);
    StorageService.setCurrentUser(result.user, rememberMe);
    StorageService.logAudit({
      user_id: result.user.id,
      user_name: result.user.name,
      user_role: result.user.role_name,
      entity_type: 'AUTH',
      entity_id: result.user.id,
      action: 'USER_LOGIN',
      description: `Logged in successfully as ${result.user.name} (${result.user.role_name})`,
    });

    router.push(getDashboardPath(result.user.role_code));
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-[#0B1F3A] px-10 py-12 text-white lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(37,99,235,0.35), transparent 42%), radial-gradient(circle at 80% 80%, rgba(29,78,216,0.28), transparent 36%)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative z-10 flex h-full flex-col justify-between">
          <CareyuLogo variant="light" />

          <div className="max-w-lg space-y-6">
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight text-white">
                Project Management Tool
              </h1>
              <p className="max-w-md text-base leading-relaxed text-blue-100/80">
                Manage projects, teams and execution in one place.
              </p>
            </div>
            <ExecutionFlow />
          </div>

          <p className="relative z-10 text-xs text-blue-200/60">
            © {new Date().getFullYear()} Careyu Automation. All rights reserved.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[440px]">
          <div className="mb-8 lg:hidden">
            <CareyuLogo />
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-[#0B1F3A]">
              Project Management Tool
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Manage projects, teams and execution in one place.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-7 shadow-[0_12px_40px_rgba(15,36,68,0.08)] sm:p-8">
            <div className="mb-7">
              <h2 className="text-2xl font-semibold tracking-tight text-[#0B1F3A]">Welcome Back</h2>
              <p className="mt-1.5 text-sm text-slate-500">
                Sign in to continue to your dashboard
              </p>
            </div>

            {formError && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <label htmlFor="work-email" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Work Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="work-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    placeholder="Enter your work email"
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                    data-demo="login-email"
                    className={`w-full rounded-xl border bg-slate-50 py-2.5 pl-10 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:bg-white focus:ring-4 ${
                      fieldErrors.email
                        ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
                        : 'border-slate-200 focus:border-[#1D4ED8] focus:ring-blue-100'
                    }`}
                  />
                </div>
                {fieldErrors.email && (
                  <p id="email-error" className="mt-1.5 text-xs text-red-600">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                    }}
                    placeholder="Enter your password"
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                    data-demo="login-password"
                    className={`w-full rounded-xl border bg-slate-50 py-2.5 pl-10 pr-11 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:bg-white focus:ring-4 ${
                      fieldErrors.password
                        ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
                        : 'border-slate-200 focus:border-[#1D4ED8] focus:ring-blue-100'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition-colors hover:text-slate-700"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p id="password-error" className="mt-1.5 text-xs text-red-600">
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#1D4ED8] accent-[#1D4ED8]"
                  />
                  Remember me
                </label>
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-[#1D4ED8] hover:text-[#1E40AF]"
                >
                  Forgot Password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={loading}
                data-demo="login-submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-900/20 transition-colors hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-80"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              Need help?{' '}
              <a href="mailto:admin@careyu.com" className="font-medium text-[#1D4ED8] hover:text-[#1E40AF]">
                Contact Admin
              </a>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
