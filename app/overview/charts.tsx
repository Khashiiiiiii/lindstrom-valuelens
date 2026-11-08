// The Overview's SVG charts (#27, #28): the tile sparkline, the monthly trend chart, the on-time gauge, the waste
// route donut and turnaround by stage as stacked bars. They draw runKpi values the page data holds and compute no
// figure (ADR 0001). They are plain SVG, with no chart library. Each SVG takes the drawKey of the values it draws,
// so it draws in when those values change and not on a language switch or a new highlight (#33).

import type { HealthThresholds, Month } from "../../lib/data.ts";
import type { Lang } from "../../lib/i18n.ts";
import { formatNumber, monthName, t } from "../../lib/i18n.ts";
import { drawKey } from "../draw-key.ts";
import type { StageBars } from "./kam-cards.ts";

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
    <svg key={drawKey(values)} className="spark draw-fade" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
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
  /** The unit after each month's value in the point titles, from trendOptions. */
  pointUnits: string[];
}

/** One KPI over the data months, with the selected period's months highlighted. */
export function TrendChart({ lang, months, highlighted, values, unit, pointUnits }: TrendChartProps) {
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
    <svg key={drawKey(values, unit)} className="trend" viewBox={`0 0 ${W} ${H}`} role="img">
      {grid.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />
          <text x={L - 8} y={y(v) + 4} textAnchor="end">
            {chartNumber(lang, v, unit)}
          </text>
        </g>
      ))}
      {band && <rect x={band.x} y={T} width={band.w} height={H - T - B} rx={8} className="band" />}
      <path d={linePath(values.map((v, i) => (v === null ? null : [x(i), y(v)])))} pathLength={1} className="line draw-line" />
      {values.map((v, i) =>
        v === null ? null : (
          <circle key={months[i]} cx={x(i)} cy={y(v)} r={on[i] ? 4 : 3} className={on[i] ? "pt on draw-fade" : "pt draw-fade"}>
            <title>
              {`${monthName(lang, months[i])} ${months[i].slice(0, 4)}: ${chartNumber(lang, v, unit)}${pointUnits[i] ? ` ${pointUnits[i]}` : ""}`}
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
      <svg key={drawKey(value)} viewBox="0 0 220 130" role="img">
        <path d={arc} className="track" pathLength={100} />
        <path d={arc} pathLength={100} strokeDasharray={`${(value * 100).toFixed(2)} 100`} className="val draw-sweep" />
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

const SERIES_COLOURS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)"];

/** The waste routes as a ring. Each arc's length is the route's part of the total. The centre shows the total. */
export function Donut({ segments, total, unit }: { segments: { key: string; label: string; kg: string; fraction: number }[]; total: string; unit: string }) {
  let offset = 0;
  return (
    <div className="donutwrap">
      <svg key={drawKey(segments.map((s) => [s.key, s.fraction]))} className="donut" viewBox="0 0 160 160" role="img">
        <g transform="rotate(-90 80 80)">
          {segments.map((s, i) => {
            const length = s.fraction * 100;
            const arc = (
              <circle
                key={s.key}
                cx={80}
                cy={80}
                r={58}
                pathLength={100}
                stroke={SERIES_COLOURS[i % SERIES_COLOURS.length]}
                strokeDasharray={`${Math.max(length - 0.6, 0.1).toFixed(2)} 100`}
                strokeDashoffset={-offset}
                className="seg draw-sweep"
              >
                <title>{`${s.label}: ${s.kg} ${unit}`}</title>
              </circle>
            );
            offset += length;
            return arc;
          })}
        </g>
        <text x={80} y={80} textAnchor="middle" className="big">
          {total}
        </text>
        <text x={80} y={98} textAnchor="middle">
          {unit}
        </text>
      </svg>
      <div className="legend">
        {segments.map((s, i) => (
          <div key={s.key}>
            <i style={{ background: SERIES_COLOURS[i % SERIES_COLOURS.length] }} />
            <span>{s.label}</span>
            <b>
              {s.kg} {unit}
            </b>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One bar per month, stacked by stage. Months outside the selected period are dimmed. */
export function StackedBars({ lang, legend, bars }: { lang: Lang; legend: string[]; bars: StageBars["bars"] }) {
  const W = 640, H = 220, L = 34, R = 6, T = 10, B = 26;
  const totals = bars.map((b) => b.hours.reduce((n, h) => n + h, 0));
  const max = Math.ceil(Math.max(...totals, 1) / 20) * 20;
  const step = (W - L - R) / bars.length;
  const width = step * 0.56;
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  return (
    <>
      <svg key={drawKey(bars.map((b) => b.hours))} className="stacked" viewBox={`0 0 ${W} ${H}`} role="img">
        {[0, 0.5, 1].map((k) => (
          <g key={k}>
            <line x1={L} x2={W - R} y1={y(max * k)} y2={y(max * k)} className="grid" />
            <text x={L - 6} y={y(max * k) + 4} textAnchor="end">
              {formatNumber(lang, max * k)}
            </text>
          </g>
        ))}
        {bars.map((bar, i) => {
          const x = L + i * step + (step - width) / 2;
          let stacked = 0;
          return (
            <g key={i} className={bar.in_period ? undefined : "dim"}>
              {bar.hours.map((h, k) => {
                const top = y(stacked + h);
                const height = y(stacked) - top;
                stacked += h;
                return (
                  <rect key={k} x={x} y={top} width={width} height={Math.max(height - 1, 0)} rx={k === bar.hours.length - 1 ? 4 : 0} fill={SERIES_COLOURS[k]} className="draw-grow">
                    <title>{bar.titles[k]}</title>
                  </rect>
                );
              })}
              <text x={L + i * step + step / 2} y={H - 6} textAnchor="middle" className={bar.in_period ? "hi" : undefined}>
                {bar.month}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="legend row">
        {legend.map((name, i) => (
          <div key={name}>
            <i style={{ background: SERIES_COLOURS[i] }} />
            <span>{name}</span>
          </div>
        ))}
      </div>
    </>
  );
}
