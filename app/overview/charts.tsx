// The Overview's SVG charts (#27): the tile sparkline, the monthly trend chart and the on-time gauge. They draw
// runKpi values the page data holds and compute no figure (ADR 0001). They are plain SVG, with no chart library.

import type { HealthThresholds, Month } from "../../lib/data.ts";
import type { Lang } from "../../lib/i18n.ts";
import { dataLabel, formatNumber, monthName, t } from "../../lib/i18n.ts";

/** A value as chart text: a share as a percentage, else a number with at most 2 decimals. */
function chartNumber(lang: Lang, value: number, unit: string): string {
  if (unit === "share") return formatNumber(lang, value, { style: "percent", maximumFractionDigits: 1 });
  return formatNumber(lang, value, { maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2 });
}

/** The SVG path through the points, with a gap at a null value. */
function linePath(points: ([number, number] | null)[]): string {
  let path = "";
  let drawing = false;
  for (const p of points) {
    if (p === null) {
      drawing = false;
      continue;
    }
    path += `${drawing ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    drawing = true;
  }
  return path;
}

/** The lowest and highest non-null value, or null with fewer than 2 values. */
function range(values: (number | null)[]): [number, number] | null {
  const shown = values.filter((v): v is number => v !== null);
  return shown.length < 2 ? null : [Math.min(...shown), Math.max(...shown)];
}

/** A tile's 12 months as a small line. Draws nothing with fewer than 2 values. */
export function Sparkline({ values }: { values: (number | null)[] }) {
  const span = range(values);
  if (span === null) return null;
  const [min, max] = span;
  const x = (i: number) => (i * 100) / (values.length - 1);
  const y = (v: number) => 28 - ((v - min) / (max - min || 1)) * 24;
  const line = linePath(values.map((v, i) => (v === null ? null : [x(i), y(v)])));
  return (
    <svg className="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <path d={line} />
    </svg>
  );
}

export interface TrendChartProps {
  lang: Lang;
  months: Month[];
  /** The months of the selected period, which the chart highlights. */
  highlighted: Month[];
  values: (number | null)[];
  unit: string;
}

/** One KPI over the data months, with the selected period's months highlighted. */
export function TrendChart({ lang, months, highlighted, values, unit }: TrendChartProps) {
  const span = range(values);
  if (span === null) return null;
  const W = 640, H = 230, L = 56, R = 20, T = 12, B = 26;
  const pad = (span[1] - span[0]) * 0.15 || Math.abs(span[1]) * 0.05 || 1;
  const min = Math.max(0, span[0] - pad);
  const max = unit === "share" ? Math.min(1, span[1] + pad) : span[1] + pad;
  const x = (i: number) => L + (i * (W - L - R)) / (months.length - 1);
  const y = (v: number) => T + (1 - (v - min) / (max - min || 1)) * (H - T - B);
  const on = months.map((m) => highlighted.includes(m));
  const first = on.indexOf(true);
  const last = on.lastIndexOf(true);
  const band = first === -1 || (first === 0 && last === months.length - 1) ? null : { x: x(first) - 14, w: x(last) - x(first) + 28 };
  const grid = [0, 1, 2, 3].map((k) => min + ((max - min) * k) / 3);
  return (
    <svg className="trend" viewBox={`0 0 ${W} ${H}`} role="img">
      {grid.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />
          <text x={L - 8} y={y(v) + 4} textAnchor="end">
            {chartNumber(lang, v, unit)}
          </text>
        </g>
      ))}
      {band && <rect x={band.x} y={T} width={band.w} height={H - T - B} rx={8} className="band" />}
      <path d={linePath(values.map((v, i) => (v === null ? null : [x(i), y(v)])))} className="line" />
      {values.map((v, i) =>
        v === null ? null : (
          <circle key={months[i]} cx={x(i)} cy={y(v)} r={on[i] ? 4 : 3} className={on[i] ? "pt on" : "pt"}>
            <title>
              {`${monthName(lang, months[i])} ${months[i].slice(0, 4)}: ${chartNumber(lang, v, unit)}${unit === "share" ? "" : ` ${dataLabel(lang, unit, v)}`}`}
            </title>
          </circle>
        ),
      )}
      {months.map((m, i) => (
        <text key={m} x={x(i)} y={H - 6} textAnchor="middle" className={on[i] ? "hi" : undefined}>
          {monthName(lang, m, "short")}
        </text>
      ))}
    </svg>
  );
}

/** A point on the gauge arc for a share from 0 to 1, at the radius. */
function arcPoint(share: number, radius: number): [number, number] {
  const angle = Math.PI * (1 - share);
  return [110 + radius * Math.cos(angle), 110 - radius * Math.sin(angle)];
}

/** On-time service cycle share on a half circle from 0 to 100%. In the KAM view, ticks mark the account health thresholds. */
export function Gauge({ lang, value, thresholds }: { lang: Lang; value: number; thresholds: HealthThresholds | null }) {
  const arc = "M 20 110 A 90 90 0 0 1 200 110";
  const tick = (share: number, className: string) => {
    const [x1, y1] = arcPoint(share, 74);
    const [x2, y2] = arcPoint(share, 104);
    return <line x1={x1} y1={y1} x2={x2} y2={y2} className={`tick ${className}`} />;
  };
  return (
    <div className="gauge">
      <svg viewBox="0 0 220 130" role="img">
        <path d={arc} className="track" pathLength={100} />
        <path d={arc} className="val" pathLength={100} strokeDasharray={`${(value * 100).toFixed(2)} 100`} />
        {thresholds && tick(thresholds.amber_threshold, "amber")}
        {thresholds && tick(thresholds.green_threshold, "green")}
        <text x={110} y={100} textAnchor="middle" className="big">
          {chartNumber(lang, value, "share")}
        </text>
      </svg>
      <div className="muted">{t(lang, "of sampled service cycles on time")}</div>
      {thresholds && (
        <div className="muted">
          {t(lang, "Green from {g}, amber from {a}", {
            g: chartNumber(lang, thresholds.green_threshold, "share"),
            a: chartNumber(lang, thresholds.amber_threshold, "share"),
          })}
        </div>
      )}
    </div>
  );
}
