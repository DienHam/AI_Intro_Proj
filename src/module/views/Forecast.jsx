import { ResponsiveContainer, BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import { formatValue, seriesFor } from "../aqi";
import { axisTick, tooltipStyle } from "./chartStyle";

const UP = "#e8833a";
const DOWN = "#5aa17f";

export default function Forecast({ city, stationValues, selectedId, onSelect, cityAvg }) {
  const selected = stationValues.find((s) => s.id === selectedId) ?? stationValues[0];

  const changes = stationValues
    .filter((s) => s.pm25 != null && s.nextHourPM25 != null)
    .map((s) => ({ name: s.name, delta: Number((s.nextHourPM25 - s.pm25).toFixed(1)) }))
    .sort((a, b) => b.delta - a.delta);
  const rising = changes.filter((c) => c.delta > 0.4).length;
  const falling = changes.filter((c) => c.delta < -0.4).length;
  const cityDelta = city.avg25 != null && city.avgNext != null ? city.avgNext - city.avg25 : null;

  const series = seriesFor(selected, 24, cityAvg);

  return (
    <div className="view-grid two">
      <article className="card">
        <span className="eyebrow">CITY AVERAGE · NEXT HOUR</span>
        <div className="forecast-pair">
          <div><small>Now</small><strong>{formatValue(city.avg25)}</strong></div>
          <span className="arrow">→</span>
          <div><small>+1 h</small><strong>{formatValue(city.avgNext)}</strong></div>
        </div>
        <p className={`delta ${cityDelta == null ? "" : cityDelta > 0.4 ? "up" : cityDelta < -0.4 ? "down" : ""}`}>
          {cityDelta == null
            ? "Chưa có số liệu dự báo"
            : Math.abs(cityDelta) < 0.5
              ? "Gần như không đổi"
              : `${cityDelta > 0 ? "Tăng" : "Giảm"} ${Math.abs(cityDelta).toFixed(1)} µg/m³`}
        </p>
      </article>

      <article className="card">
        <span className="eyebrow">DIRECTION ACROSS AREAS</span>
        <div className="who-row">
          <div><span className="eyebrow">RISING</span><div className="stat-number up">{rising}<small>khu vực</small></div></div>
          <div><span className="eyebrow">FALLING</span><div className="stat-number down">{falling}<small>khu vực</small></div></div>
        </div>
      </article>

      <article className="card">
        <div className="card-head">
          <div><h3>Change by area</h3><p>µg/m³ so với giờ hiện tại</p></div>
        </div>
        <div className="chart-box bars">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={changes} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="#eeebe3" horizontal={false} />
              <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={axisTick} tickLine={false} axisLine={false} width={96} />
              <ReferenceLine x={0} stroke="#c9c5b8" />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f3f1ea" }} formatter={(v) => `${v > 0 ? "+" : ""}${v} µg/m³`} />
              <Bar dataKey="delta" radius={3} barSize={10}>
                {changes.map((c) => <Cell key={c.name} fill={c.delta > 0 ? UP : DOWN} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="card">
        <div className="card-head">
          <div><h3>{selected?.name}</h3><p>24 giờ qua và giờ tiếp theo</p></div>
          <select className="select" value={selectedId} onChange={(e) => onSelect(Number(e.target.value))} aria-label="Chọn khu vực">
            {stationValues.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="chart-box bars">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#eeebe3" vertical={false} />
              <XAxis dataKey="axis" tick={axisTick} tickLine={false} axisLine={false} minTickGap={26} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(_, p) => p?.[0]?.payload?.full} formatter={(v, name) => [`${Number(v).toFixed(1)} µg/m³`, name]} />
              <Line type="monotone" dataKey="hist" name="Measured" stroke="#2f6f5e" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="fc" name="Forecast" stroke={UP} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3, fill: UP }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>

      <p className="note span-2">
        Dự báo lấy từ Open-Meteo, chưa phải mô hình tự huấn luyện của dự án.
      </p>
    </div>
  );
}
