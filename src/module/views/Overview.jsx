import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine
} from "recharts";
import { formatValue } from "../aqi";
import { WHO_PM25, buildCitySeries, buildInsights, dayHourGrid, rgb } from "../insights";
import { axisTick, tooltipStyle } from "./chartStyle";

const LEGEND_STOPS = [15, 22, 28, 35, 42, 52, 60].map((v) => rgb(v)).join(", ");
const TONES = ["tone-a", "tone-b", "tone-c", "tone-d"];

export default function Overview({ city, stationValues, cityAvg, onOpenStation }) {
  const series = useMemo(() => buildCitySeries(stationValues, cityAvg), [stationValues, cityAvg]);
  const { headline, cards, profile, usualHour } = useMemo(
    () => buildInsights({ city, stationValues, series }),
    [city, stationValues, series]
  );
  const grid = useMemo(() => dayHourGrid(series), [series]);
  const last = series[series.length - 1];

  const ranked = useMemo(
    () =>
      stationValues
        .filter((s) => s.pm25 != null)
        .map((s) => ({ id: s.id, name: s.name, value: Number(Number(s.pm25).toFixed(1)) }))
        .sort((a, b) => b.value - a.value),
    [stationValues]
  );

  const profileData = profile.map((p) => ({ ...p, value: p.value == null ? null : Number(p.value.toFixed(1)) }));
  const trendData = series.map((p) => ({ ...p, value: p.value == null ? null : Number(p.value.toFixed(1)) }));

  return (
    <div className="ov">
      <article className="ov-hero">
        <div className="ov-hero-text">
          <span className="eyebrow">NHẬN ĐỊNH HÔM NAY</span>
          <h2>{headline.title}</h2>
          <p>{headline.text}</p>
        </div>
        <dl className="ov-kpis">
          <div>
            <dt>PM2.5 trung bình</dt>
            <dd>{formatValue(last?.value ?? city.avg25)}<small>µg/m³</small></dd>
          </div>
          <div>
            <dt>So với WHO</dt>
            <dd>{headline.times == null ? "--" : `${headline.times.toFixed(1)}×`}</dd>
          </div>
          <div>
            <dt>So với hôm qua</dt>
            <dd className={headline.vsYesterday == null ? "" : headline.vsYesterday > 0.4 ? "up" : headline.vsYesterday < -0.4 ? "down" : ""}>
              {headline.vsYesterday == null ? "--" : `${headline.vsYesterday > 0 ? "+" : ""}${headline.vsYesterday.toFixed(1)}`}
            </dd>
          </div>
        </dl>
      </article>

      <div className="ov-insights">
        {cards.map((c, i) => (
          <article key={c.key} className={`ov-insight ${TONES[i % TONES.length]}`}>
            <span className="ov-kicker">{c.kicker}</span>
            <div className="ov-stat">{c.stat}</div>
            <small>{c.statNote}</small>
            <p>{c.text}</p>
          </article>
        ))}
      </div>

      <article className="card">
        <div className="card-head">
          <div>
            <h3>Bụi mịn theo giờ, 7 ngày qua</h3>
            <p>Mỗi ô là trung bình PM2.5 của 12 khu vực trong một giờ. Ô viền đen là giờ hiện tại.</p>
          </div>
          <div className="cal-legend" aria-hidden="true">
            <span>15</span>
            <i style={{ background: `linear-gradient(90deg, ${LEGEND_STOPS})` }} />
            <span>60+</span>
          </div>
        </div>
        <div className="cal" role="img" aria-label="Bản đồ nhiệt PM2.5 trung bình theo ngày và giờ">
          <div className="cal-row head">
            <span />
            {Array.from({ length: 24 }, (_, h) => <span key={h} className="cal-hour">{h % 3 === 0 ? String(h).padStart(2, "0") : ""}</span>)}
          </div>
          {grid.map((row) => (
            <div className="cal-row" key={row.day}>
              <span className="cal-day">{row.label}</span>
              {row.cells.map((cell, h) => (
                <i
                  key={h}
                  className={`cal-cell ${cell && last && cell.ts === last.ts ? "now" : ""}`}
                  style={{ background: cell?.value != null ? rgb(cell.value) : undefined }}
                  title={cell?.value != null ? `${cell.full} · ${cell.value.toFixed(1)} µg/m³` : "Chưa có số liệu"}
                />
              ))}
            </div>
          ))}
        </div>
      </article>

      <div className="ov-pair">
        <article className="card">
          <div className="card-head">
            <div><h3>Giờ nào trong ngày cao nhất?</h3><p>Trung bình theo giờ, cột đậm là giờ hiện tại</p></div>
          </div>
          <div className="chart-box bars">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={profileData} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
                <CartesianGrid stroke="#eeebe3" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval={2} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f3f1ea" }} formatter={(v) => [`${v} µg/m³`, "PM2.5 trung bình"]} />
                <ReferenceLine y={WHO_PM25} stroke="#1d2320" strokeDasharray="4 4" label={{ value: "WHO 15", position: "insideTopRight", fill: "#6b726c", fontSize: 11 }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {profileData.map((p) => (
                    <Cell key={p.hour} fill={p.value == null ? "#e7e4dc" : rgb(p.value)} fillOpacity={p.hour === usualHour ? 1 : 0.55} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="card">
          <div className="card-head">
            <div><h3>Khu vực nào đang cao nhất?</h3><p>PM2.5 hiện tại, bấm để xem trên bản đồ</p></div>
          </div>
          <div className="chart-box bars">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ranked} layout="vertical" margin={{ top: 4, right: 14, left: 4, bottom: 0 }}>
                <CartesianGrid stroke="#eeebe3" horizontal={false} />
                <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={axisTick} tickLine={false} axisLine={false} width={96} interval={0} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f3f1ea" }} formatter={(v) => [`${v} µg/m³`, "PM2.5"]} />
                <ReferenceLine x={WHO_PM25} stroke="#1d2320" strokeDasharray="4 4" />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={10} onClick={(d) => onOpenStation(d.id)} style={{ cursor: "pointer" }}>
                  {ranked.map((s) => <Cell key={s.id} fill={rgb(s.value)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>

      <article className="card">
        <div className="card-head">
          <div><h3>Diễn biến cả thành phố</h3><p>Trung bình 12 khu vực theo giờ, đường nét đứt là ngưỡng WHO</p></div>
        </div>
        <div className="chart-box tall">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="ovFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={rgb(30)} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={rgb(30)} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#eeebe3" vertical={false} />
              <XAxis dataKey="axis" tick={axisTick} tickLine={false} axisLine={false} minTickGap={42} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(_, p) => p?.[0]?.payload?.full} formatter={(v) => [`${v} µg/m³`, "PM2.5"]} />
              <ReferenceLine y={WHO_PM25} stroke="#1d2320" strokeDasharray="4 4" label={{ value: "WHO 15", position: "insideTopRight", fill: "#6b726c", fontSize: 11 }} />
              <Area type="monotone" dataKey="value" stroke={rgb(26)} strokeWidth={2} fill="url(#ovFill)" connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </article>
    </div>
  );
}
