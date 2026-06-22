interface StatCardProps {
  label: string;
  value: number;
  color?: string;
}

export function StatCard({ label, value, color = '#e2e2e2' }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value" style={{ color }}>{value}</div>
    </div>
  );
}
