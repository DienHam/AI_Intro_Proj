import { useMemo, useState } from "react";
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { downloadCsv, formatValue, seriesFor } from "../aqi";
import { axisTick, tooltipStyle } from "./chartStyle";

export default function Historical({ stationValues, selectedId, onSelect, cityAvg }) {
  const [hours, setHours] = useState(24);
  const selected = stationValues.find((s) => s.id === selectedId) ?? stationValues[0];

  const series = useMemo(
    () => seriesFor(selected, hours, cityAvg).filter((p) => !p.isForecast),
    [selected, hours, cityAvg]
  );

  const values = series.map((p) => p.pm25).filter((v) => v != null);
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const peak = series.reduce((best, p) => (p.pm25 != null && (best == null || p.pm25 > best.pm25) ? p : best), null);
  const low = series.reduce((best, p) => (p.pm25 != null && (best == null || p.pm25 < best.pm25) ? p : best), null);
  const latest = series[series.length - 1];

  function exportCsv() {
    const rows = [["time", "pm2_5_ug_m3", "pm10_ug_m3"], ...series.map((p) => [p.ts, p.pm25 ?? "", p.pm10 ?? ""])];
    downloadCsv(`${selected.name.replace(/\s+/g, "_")}_${hours}h.csv`, rows);
  }

  return (
    <div className="view-grid">
      <article className="card">
        <div className="card-head">
          <div><h3>{selected?.name}</h3><p>PM2.5 và PM10 theo giờ</p></div>
          <div className="controls">
            <select className="select" value={selectedId} onChange={(e) => onSelect(Number(e.target.value))} aria-label="Chọn khu vực">
              {stationValues.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="segmented" role="group" aria-label="Khoảng thời gian">
              {[[24, "24H"], [168, "7D"]].map(([h, label]) => (
                <button key={h} type="button" className={hours === h ? "on" : ""} onClick={() => setHours(h)}>{label}</button>
              ))}
            </div>
            <button type="button" className="btn" onClick={exportCsv} disabled={!series.length}>Export CSV</button>
          </div>
        </div>

        <div className="stat-row">
          <div><span className="eyebrow">AVERAGE</span><strong>{formatValue(mean)}</strong></div>
          <div><span className="eyebrow">PEAK</span><strong>{formatValue(peak?.pm25)}</strong><small>{peak?.full}</small></div>
          <div><span className="eyebrow">LOWEST</span><strong>{formatValue(low?.pm25)}</strong><small>{low?.full}</small></div>
          <div><span className="eyebrow">LATEST</span><strong>{formatValue(latest?.pm25)}</strong><small>{latest?.full}</small></div>
        </div>

        <div className="chart-box tall">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="pmFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2f6f5e" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#2f6f5e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#eeebe3" vertical={false} />
              <XAxis dataKey="axis" tick={axisTick} tickLine={false} axisLine={false} minTickGap={hours > 24 ? 48 : 28} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(_, p) => p?.[0]?.payload?.full} formatter={(v, name) => [`${Number(v).toFixed(1)} µg/m³`, name]} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="pm25" name="PM2.5" stroke="#2f6f5e" strokeWidth={2} fill="url(#pmFill)" connectNulls />
              <Line type="monotone" dataKey="pm10" name="PM10" stroke="#c9b27a" strokeWidth={1.6} dot={false} connectNulls />
              <Line type="monotone" dataKey="city" name="Hanoi avg PM2.5" stroke="#1d2320" strokeWidth={1.4} strokeDasharray="4 4" dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="card">
        <div className="card-head">
          <div><h3>Hourly values</h3><p>Mới nhất ở trên cùng</p></div>
        </div>
        <div className="table-wrap short">
          <table className="data-table">
            <thead><tr><th>Time</th><th className="num">PM2.5</th><th className="num">PM10</th></tr></thead>
            <tbody>
              {[...series].reverse().map((p) => (
                <tr key={p.ts}>
                  <td>{p.full}</td>
                  <td className="num strong">{formatValue(p.pm25)}</td>
                  <td className="num">{formatValue(p.pm10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}
