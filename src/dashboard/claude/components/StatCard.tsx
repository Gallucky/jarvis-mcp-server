import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: string;
  sub?: ReactNode;
}

export function StatCard({ label, value, icon, sub }: StatCardProps) {
  return (
    <div className="claude-stat-card">
      {icon && <div className="claude-stat-icon">{icon}</div>}
      <div className="claude-stat-label">{label}</div>
      <div className="claude-stat-value">{value}</div>
      {sub && <div className="claude-stat-sub">{sub}</div>}
    </div>
  );
}
