import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { ADVICE, BANDS, formatValue, statusFor } from "../aqi";
import { axisTick, tooltipStyle } from "./chartStyle";

// WHO 2021 air quality guidelines, 24-hour mean.
const WHO_PM25 = 15;
const WHO_PM10 = 45;

export default function AirQuality({ city, stationValues }) {
  const withData = stationValues.filter((s) => s.pm25 != null);
  const total = withData.length || 1;
  const counts = BANDS.map((band) => ({
    ...band,
    count: withData.filter((s) => statusFor(s.pm25).className === band.className).length
  }));
  const overPm25 = withData.filter((s) => s.pm25 > WHO_PM25).length;
  const overPm10 = stationValues.filter((s) => s.pm10 != null && s.pm10 > WHO_PM10).length;
  const avgStatus = statusFor(city.avg25);

  const compare = [...withData]
    .sort((a, b) => b.pm25 - a.pm25)
    .map((s) => ({ name: s.name, pm25: Number(s.pm25.toFixed(1)), pm10: s.pm10 == null ? null : Number(s.pm10.toFixed(1)) }));

  return (
    <div className="view-grid two">
      <article className="card">
        <div className="card-head">
          <div><h3>Status distribution</h3><p>Số khu vực theo từng mức PM2.5</p></div>
        </div>
        <div className="band-bar" role="img" aria-label="Phân bố mức PM2.5">
          {counts.map((b) => b.count > 0 && <i key={b.className} style={{ flex: b.count, background: b.color }} />)}
        </div>
        <ul className="band-list">
          {counts.map((b) => (
            <li key={b.className}>
              <span className="dot" style={{ background: b.color }} />
              <span className="band-name">{b.label}<small>{b.range} µg/m³</small></span>
              <strong>{b.count}</strong>
              <small>{Math.round((b.count / total) * 100)}%</small>
            </li>
          ))}
        </ul>
      </article>

      <article className="card">
        <div className="card-head">
          <div><h3>Versus WHO guideline</h3><p>Ngưỡng trung bình 24 giờ (WHO 2021)</p></div>
        </div>
        <div className="who-row">
          <div>
            <span className="eyebrow">PM2.5 &gt; {WHO_PM25}</span>
            <div className="stat-number">{overPm25}<small>/ {withData.length} khu vực</small></div>
          </div>
          <div>
            <span className="eyebrow">PM10 &gt; {WHO_PM10}</span>
            <div className="stat-number">{overPm10}<small>/ {withData.length} khu vực</small></div>
          </div>
        </div>
        <p className="note">
          {city.avg25 == null
            ? "Chưa có số liệu."
            : `PM2.5 trung bình hiện là ${formatValue(city.avg25)} µg/m³, bằng ${(city.avg25 / WHO_PM25).toFixed(1)} lần ngưỡng khuyến nghị.`}
        </p>
      </article>

      <article className="card span-2">
        <div className="card-head">
          <div><h3>PM2.5 vs PM10 by area</h3><p>Sắp theo PM2.5 giảm dần</p></div>
        </div>
        <div className="chart-box bars">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={compare} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barGap={2}>
              <CartesianGrid stroke="#eeebe3" horizontal={false} />
              <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={axisTick} tickLine={false} axisLine={false} width={96} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f3f1ea" }} formatter={(v) => `${v} µg/m³`} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="pm25" name="PM2.5" fill="#2f6f5e" radius={[0, 4, 4, 0]} barSize={9} />
              <Bar dataKey="pm10" name="PM10" fill="#d4c59a" radius={[0, 4, 4, 0]} barSize={9} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="card span-2 advice-card">
        <span className="eyebrow">HEALTH GUIDANCE · {avgStatus.label.toUpperCase()}</span>
        <p>{ADVICE[avgStatus.className]}</p>
      </article>
    </div>
  );
}
