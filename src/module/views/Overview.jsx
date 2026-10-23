import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import StationMap from "../StationMap";
import { formatValue, statusFor } from "../aqi";
import { axisTick, tooltipStyle } from "./chartStyle";

export default function Overview({ city, stationValues, selectedId, onSelect, onOpenStation, cityTrend }) {
  const avgStatus = statusFor(city.avg25);
  const ranked = [...stationValues].filter((s) => s.pm25 != null).sort((a, b) => b.pm25 - a.pm25);

  return (
    <div className="view-grid three">
      <article className="card hero-card">
        <span className="eyebrow">HANOI AVERAGE · PM2.5</span>
        <div className="hero-number">
          {formatValue(city.avg25)}<small>µg/m³</small>
        </div>
        <span className={`pill ${avgStatus.className}`}><i />{avgStatus.label}</span>
        <p className="hero-note">
          Trung bình {city.count} khu vực đang có số liệu. PM10 trung bình {formatValue(city.avg10)} µg/m³.
        </p>
      </article>

      <article className="card stat-card">
        <span className="eyebrow">HIGHEST NOW</span>
        {city.highest ? (
          <>
            <h3>{city.highest.name}</h3>
            <div className="stat-number">{formatValue(city.highest.pm25)}<small>µg/m³</small></div>
            <span className={`pill ${statusFor(city.highest.pm25).className}`}><i />{statusFor(city.highest.pm25).label}</span>
          </>
        ) : <p className="empty">Chưa có dữ liệu</p>}
      </article>

      <article className="card stat-card">
        <span className="eyebrow">CLEANEST NOW</span>
        {city.lowest ? (
          <>
            <h3>{city.lowest.name}</h3>
            <div className="stat-number">{formatValue(city.lowest.pm25)}<small>µg/m³</small></div>
            <span className={`pill ${statusFor(city.lowest.pm25).className}`}><i />{statusFor(city.lowest.pm25).label}</span>
          </>
        ) : <p className="empty">Chưa có dữ liệu</p>}
      </article>

      <article className="card span-2 map-card">
        <div className="card-head">
          <div><h3>Where it&apos;s worst</h3><p>Chọn một khu vực để xem chi tiết</p></div>
        </div>
        <div className="mini-map">
          <StationMap stations={stationValues} selectedId={selectedId} onSelect={onSelect} compact heat />
        </div>
      </article>

      <article className="card rank-card">
        <div className="card-head">
          <div><h3>Ranking</h3><p>PM2.5 cao → thấp</p></div>
        </div>
        <ol className="rank-list">
          {ranked.map((station, index) => {
            const status = statusFor(station.pm25);
            return (
              <li key={station.id}>
                <button type="button" onClick={() => onOpenStation(station.id)}>
                  <span className="rank-index">{index + 1}</span>
                  <span className="rank-name">{station.name}</span>
                  <span className="rank-track"><i style={{ width: `${Math.min(100, station.pm25)}%`, background: status.color }} /></span>
                  <strong>{formatValue(station.pm25)}</strong>
                </button>
              </li>
            );
          })}
        </ol>
      </article>

      <article className="card span-3">
        <div className="card-head">
          <div><h3>Citywide PM2.5, last 24 hours</h3><p>Trung bình các khu vực</p></div>
        </div>
        <div className="chart-box tall">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={cityTrend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="cityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2f6f5e" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#2f6f5e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#eeebe3" vertical={false} />
              <XAxis dataKey="axis" tick={axisTick} tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(_, p) => p?.[0]?.payload?.full} formatter={(v) => [`${Number(v).toFixed(1)} µg/m³`, "PM2.5"]} />
              <Area type="monotone" dataKey="city" stroke="#2f6f5e" strokeWidth={2} fill="url(#cityFill)" connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </article>
    </div>
  );
}
