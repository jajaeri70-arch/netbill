import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend, BarChart, Bar, LineChart, Line,
} from 'recharts';

const GRID = 'rgba(148,163,184,0.15)';
const AXIS = { fontSize: 11, fill: '#94a3b8' };

const tooltipStyle = {
  backgroundColor: 'var(--chart-tooltip-bg)',
  border: '1px solid var(--chart-tooltip-border)',
  borderRadius: 10,
  color: 'var(--chart-tooltip-text)',
  fontSize: 12,
};

const fmtShort = (v) => {
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)} M`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)} jt`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)} rb`;
  return v;
};

export const DONUT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#f43f5e', '#94a3b8'];

/** Area chart tren (pemasukan vs pengeluaran) — PRD 7 */
export function TrendArea({ data, keys, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          {keys.map((k, i) => (
            <linearGradient key={k.key} id={`grad-${k.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={DONUT_COLORS[i]} stopOpacity={0.45} />
              <stop offset="100%" stopColor={DONUT_COLORS[i]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={fmtShort} width={52} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtShort(v)} />
        {keys.map((k, i) => (
          <Area key={k.key} type="monotone" dataKey={k.key} name={k.name}
            stroke={DONUT_COLORS[i]} fill={`url(#grad-${k.key})`} strokeWidth={2} />
        ))}
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Donut chart proporsi — PRD 5.8/7 */
export function DonutChart({ data, nameKey = 'name', valueKey = 'value', height = 240 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="55%" outerRadius="80%" paddingAngle={3}>
          {data.map((_, i) => (
            <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} stroke="none" />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Bar chart perbandingan */
export function SimpleBar({ data, keys, height = 280 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={fmtShort} width={52} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtShort(v)} />
        {keys.map((k, i) => (
          <Bar key={k.key} dataKey={k.key} name={k.name} fill={DONUT_COLORS[i]} radius={[4, 4, 0, 0]} />
        ))}
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function InstallationBar({ data, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={32} />
        <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, 'Pemasangan']} />
        <Bar dataKey="value" name="Pemasangan" fill="#10b981" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Line chart realtime */
export function LiveLine({ data, keys, height = 220 }) {
  const fmtMbps = (v) => `${Number(v || 0).toFixed(2)} Mbps`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={fmtShort} width={52} />
        <Tooltip contentStyle={tooltipStyle} formatter={fmtMbps} />
        {keys.map((k, i) => (
          <Line key={k.key} type="monotone" dataKey={k.key} name={k.name}
            stroke={DONUT_COLORS[i]} strokeWidth={2} dot={false} isAnimationActive={false} />
        ))}
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
