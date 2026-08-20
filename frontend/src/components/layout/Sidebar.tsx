'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User } from '@/lib/types';
import { filterNavForUser, NavItem } from '@/lib/rbac';
import { 
  LayoutDashboard, 
  Building2, 
  Scan, 
  Calculator, 
  Bot, 
  GanttChartSquare, 
  CheckSquare, 
  FileText, 
  Users, 
  ShoppingCart, 
  UserCheck, 
  ShieldAlert, 
  History,
  Network,
  Cpu,
  ChevronRight
} from 'lucide-react';

interface SidebarProps {
  user: User;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  LayoutDashboard: <LayoutDashboard className="w-4 h-4" />,
  Building2: <Building2 className="w-4 h-4" />,
  Scan: <Scan className="w-4 h-4" />,
  Calculator: <Calculator className="w-4 h-4" />,
  Bot: <Bot className="w-4 h-4" />,
  GanttChartSquare: <GanttChartSquare className="w-4 h-4" />,
  CheckSquare: <CheckSquare className="w-4 h-4" />,
  FileText: <FileText className="w-4 h-4" />,
  Users: <Users className="w-4 h-4" />,
  ShoppingCart: <ShoppingCart className="w-4 h-4" />,
  UserCheck: <UserCheck className="w-4 h-4" />,
  ShieldAlert: <ShieldAlert className="w-4 h-4" />,
  History: <History className="w-4 h-4" />,
  Network: <Network className="w-4 h-4" />
};

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const navItems = filterNavForUser(user);

  const categories = [
    { key: 'main', label: 'Overview' },
    { key: 'pre_sales', label: 'Pre-Sales Opportunities' },
    { key: 'projects', label: 'Project Operations' },
    { key: 'team_work', label: 'Execution & Workload' },
    { key: 'system', label: 'System & Governance' },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen sticky top-0">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800 flex items-center gap-3 bg-slate-950/50">
        <div className="w-9 h-9 rounded-lg bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold shadow-inner">
          <Cpu className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <div className="font-bold text-slate-100 text-sm tracking-wide leading-tight">Careyu Automation</div>
          <div className="text-[11px] text-cyan-400 font-medium">Project Hub</div>
        </div>
      </div>

      {/* Role Badge Indicator */}
      <div className="px-4 py-2.5 bg-slate-900/80 border-b border-slate-800/80 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Active Role</span>
        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
          {user.role_name}
        </span>
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {categories.map(cat => {
          const items = navItems.filter(i => i.category === cat.key);
          if (items.length === 0) return null;

          return (
            <div key={cat.key} className="space-y-1">
              <div className="px-2 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                {cat.label}
              </div>
              {items.map(item => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={isActive ? 'text-cyan-400' : 'text-slate-400'}>
                        {ICON_MAP[item.iconName]}
                      </span>
                      <span>{item.name}</span>
                    </div>
                    {item.badge ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-900/60 text-cyan-300 border border-cyan-700/50">
                        {item.badge}
                      </span>
                    ) : isActive ? (
                      <ChevronRight className="w-3.5 h-3.5 text-cyan-400" />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/60 text-center text-[10px] text-slate-500">
        Careyu Enterprise Platform v1.0.0
      </div>
    </aside>
  );
}
