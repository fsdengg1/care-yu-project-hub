'use client';

import React from 'react';
import { Check } from 'lucide-react';
import CareyuLogo from '@/components/brand/CareyuLogo';
import './auth.css';

const VALUE_POINTS = ['Project Management', 'Team Collaboration', 'Execution Tracking'];

export default function AuthShell({
  title,
  subtitle,
  children,
  showHeader = true,
  compact = false,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  showFlow?: boolean;
  showHeader?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="auth-signup">
      <section className="auth-signup-hero" aria-label="CareYu Automation">
        <div className="auth-signup-hero__image" />
        <div className="auth-signup-hero__overlay" />
        <div className="auth-signup-hero__content">
          <CareyuLogo variant="light" className="auth-signup-logo" />

          <div className="auth-signup-hero__copy">
            <p className="auth-signup-eyebrow">CareYu Automation</p>
            <h1 className="auth-signup-heading">
              Smart Automation.
              <br />
              Connected Operations.
            </h1>
            <p className="auth-signup-lead">
              Manage projects, teams and execution with CareYu&apos;s connected project management
              platform.
            </p>
          </div>

          <ul className="auth-signup-points">
            {VALUE_POINTS.map((point) => (
              <li key={point}>
                <span className="auth-signup-check" aria-hidden="true">
                  <Check strokeWidth={2.75} />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="auth-signup-panel">
        <div className="auth-signup-mobile-banner">
          <div className="auth-signup-hero__image" />
          <div className="auth-signup-hero__overlay" />
          <div className="auth-signup-mobile-banner__inner">
            <CareyuLogo variant="light" className="auth-signup-logo" />
          </div>
        </div>

        <div className="auth-signup-card-wrap">
          <div className={`auth-signup-card auth-fade-in ${compact ? 'auth-signup-card--compact' : ''}`}>
            {showHeader && title ? (
              <header className="auth-signup-card__header">
                <h2>{title}</h2>
                {subtitle ? <p>{subtitle}</p> : null}
              </header>
            ) : null}
            {children}
          </div>
        </div>
      </section>
    </div>
  );
}
