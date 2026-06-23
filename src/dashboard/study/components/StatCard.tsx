interface StatCardProps {
  label: string;
  value: number;
  color?: string;
}

export function StatCard({ label, value, color = '#e8eaf6' }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value" style={{ color }}>{value}</div>
    </div>
  );
}
