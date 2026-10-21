import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap
} from "react-leaflet";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from "recharts";
import "leaflet/dist/leaflet.css";
import "./index.css";
import Areas from "./module/Areas/Areas";

const stations = [
  { id: 1, name: "Ba Dinh", lat: 21.0338, lng: 105.8142 },
  { id: 2, name: "Hoan Kiem", lat: 21.0285, lng: 105.8542 },
  { id: 3, name: "Dong Da", lat: 21.0167, lng: 105.8292 },
  { id: 4, name: "Cau Giay", lat: 21.0362, lng: 105.7906 },
  { id: 5, name: "Thanh Xuan", lat: 20.9937, lng: 105.8096 },
  { id: 6, name: "Hai Ba Trung", lat: 21.0077, lng: 105.8511 },
  { id: 7, name: "Hoang Mai", lat: 20.9821, lng: 105.8614 },
  { id: 8, name: "Long Bien", lat: 21.0453, lng: 105.8797 },
  { id: 9, name: "Tay Ho", lat: 21.0688, lng: 105.8232 },
  { id: 10, name: "Nam Tu Liem", lat: 21.0136, lng: 105.7659 },
  { id: 11, name: "Bac Tu Liem", lat: 21.0738, lng: 105.7707 },
  { id: 12, name: "Ha Dong", lat: 20.9714, lng: 105.7772 }
];

function statusFor(value) {
  if (value == null || Number.isNaN(Number(value))) return { label: "No data", className: "unknown", color: "#64748b" };
  if (value < 25) return { label: "Good", className: "good", color: "#22c55e" };
  if (value < 50) return { label: "Moderate", className: "moderate", color: "#eab308" };
  if (value < 100) return { label: "High", className: "high", color: "#f97316" };
  return { label: "Very high", className: "critical", color: "#ef4444" };
}

function FitHanoi() {
  const map = useMap();
  useEffect(() => {
    map.setView([21.0285, 105.8342], 11);
    const timer = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

function App() {
  const [airData, setAirData] = useState({});
  const [selectedStationId, setSelectedStationId] = useState(2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdate, setLastUpdate] = useState(null);
  const [viewAll, setViewAll] = useState(false);
  const [activeModule, setActiveModule] = useState("Map");
  const [period, setPeriod] = useState("24H");

  useEffect(() => {
    let cancelled = false;

    async function fetchAirQuality() {
      setLoading(true);
      setError("");
      try {
        const latitudes = stations.map((station) => station.lat).join(",");
        const longitudes = stations.map((station) => station.lng).join(",");
        const url =
          "https://air-quality-api.open-meteo.com/v1/air-quality" +
          `?latitude=${latitudes}` +
          `&longitude=${longitudes}` +
          "&hourly=pm2_5,pm10" +
          "&past_hours=24&forecast_hours=2" +
          "&timezone=Asia%2FBangkok";

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Open-Meteo returned HTTP ${response.status}`);
        const raw = await response.json();
        const locations = Array.isArray(raw) ? raw : [raw];
        const next = {};

        locations.forEach((item, index) => {
          const station = stations[index];
          if (!station || !item?.hourly?.time) return;
          const times = item.hourly.time;
          const pm25History = item.hourly.pm2_5 ?? [];
          const pm10History = item.hourly.pm10 ?? [];
          // With past_hours=24, index 24 is normally the current hour.
          const currentIndex = Math.min(24, Math.max(0, times.length - 1));
          next[station.id] = {
            times,
            pm25History,
            pm10History,
            currentIndex,
            pm25: pm25History[currentIndex] ?? null,
            pm10: pm10History[currentIndex] ?? null,
            nextHourPM25: pm25History[currentIndex + 1] ?? null
          };
        });

        if (!cancelled) {
          setAirData(next);
          setLastUpdate(new Date());
          if (!Object.keys(next).length) setError("The API returned no hourly data.");
        }
      } catch (err) {
        console.error("Air-quality API error:", err);
        if (!cancelled) setError("Could not load live air-quality data. Check your connection and refresh.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAirQuality();
    const interval = setInterval(fetchAirQuality, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const selectedStation = stations.find((station) => station.id === selectedStationId) ?? stations[0];
  const selectedData = airData[selectedStationId];

  const stationValues = useMemo(
    () => stations.map((station) => ({ ...station, ...(airData[station.id] ?? {}) })),
    [airData]
  );

  const chartData = useMemo(() => {
    if (!selectedData?.times) return [];
    const values = selectedData.times.map((time, index) => ({
      timestamp: time,
      time: new Date(time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      pm25: selectedData.pm25History?.[index] ?? null,
      kind: index <= selectedData.currentIndex ? "history" : "forecast"
    }));

    // Keep 24 past/current hourly points and append the next-hour forecast.
    const start = Math.max(0, selectedData.currentIndex - 23);
    return values.slice(start, Math.min(values.length, selectedData.currentIndex + 2));
  }, [selectedData]);

  const currentPM25 = selectedData?.pm25 ?? null;
  const nextHourPM25 = selectedData?.nextHourPM25 ?? null;
  const change = currentPM25 != null && nextHourPM25 != null
    ? nextHourPM25 - currentPM25
    : null;
  const changePercent = currentPM25 > 0 && change != null
    ? (change / currentPM25) * 100
    : null;

  const availableValues = stationValues
    .map((station) => station.pm25)
    .filter((value) => value != null && Number.isFinite(Number(value)));
  const averagePM25 = availableValues.length
    ? availableValues.reduce((sum, value) => sum + Number(value), 0) / availableValues.length
    : null;
  const highestStation = stationValues
    .filter((station) => station.pm25 != null)
    .sort((a, b) => b.pm25 - a.pm25)[0];

  const visibleChartData = useMemo(() => {
    if (period === "24H") return chartData;
    // This endpoint only requests 24 hours of history. Explain that longer ranges need historical data.
    return chartData;
  }, [chartData, period]);

  function formatValue(value) {
    return value == null || !Number.isFinite(Number(value)) ? "--" : Number(value).toFixed(1);
  }

  return (
    <div className="app-shell">
      <aside className="module-sidebar">
        <div className="brand">
          <div className="brand-mark">AQ</div>
          <div className="brand-copy">
            <strong>AirQuality</strong>
            <span>HANOI MONITOR</span>
          </div>
        </div>

        <div className="sidebar-label">MODULES</div>
        <nav className="module-nav" aria-label="Main modules">
          {[
            ["Map", "⌖"],
            ["Stations", "▦"],
            ["Air Quality", "◉"],
            ["Forecast", "↗"],
            ["Historical Data", "▤"]
          ].map(([label, symbol]) => (
            <button
              key={label}
              className={`module-link ${activeModule === label ? "active" : ""}`}
              onClick={() => {
                setActiveModule(label);
                if (label === "Areas") setViewAll(false);
                if (label === "Map") setViewAll(false);
              }}
              type="button"
            >
              <span className="module-symbol">{symbol}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-status">
          <span className="online-dot" />
          <div>
            <strong>{error ? "Connection issue" : loading ? "Connecting…" : "System online"}</strong>
            <small>{error ? "API unavailable" : "Open-Meteo API"}</small>
          </div>
        </div>
      </aside>

      <main className="map-workspace">
        {activeModule === "Areas" ? (
        <Areas
          stationValues={stationValues}
          selectedStationId={selectedStationId}
          onSelectStation={(id) => {
            setSelectedStationId(id);
            setActiveModule("Map");
          }}
          loading={loading}
          error={error}
          lastUpdate={lastUpdate}
        />
      ) : (
        <>
        <div className="map-topbar">
          <div>
            <div className="eyebrow">HANOI / REAL-TIME MONITORING</div>
            <h1>{activeModule === "Forecast" ? "Air Quality Forecast" : activeModule === "Stations" ? "Monitoring Stations" : activeModule === "Historical Data" ? "Historical Overview" : "Air Quality Map"}</h1>
            <p>Live modelled PM2.5 and PM10 · 12 Hanoi areas</p>
          </div>
          <div className="update-chip">
            <span className={`online-dot ${loading || error ? "muted" : ""}`} />
            <div>
              <span>{error ? "API unavailable" : loading ? "Updating data" : "Last updated"}</span>
              <strong>{lastUpdate ? lastUpdate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</strong>
            </div>
          </div>
        </div>

        <div className="map-layer">
          <MapContainer
            center={[21.0285, 105.8342]}
            zoom={11}
            scrollWheelZoom
            className="leaflet-map"
          >
            <FitHanoi />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {stations.map((station) => {
              const value = airData[station.id]?.pm25 ?? null;
              const status = statusFor(value);
              return (
                <CircleMarker
                  key={station.id}
                  center={[station.lat, station.lng]}
                  radius={station.id === selectedStationId ? 12 : 8}
                  pathOptions={{
                    color: station.id === selectedStationId ? "#ffffff" : status.color,
                    weight: station.id === selectedStationId ? 3 : 2,
                    fillColor: status.color,
                    fillOpacity: 0.9
                  }}
                  eventHandlers={{ click: () => setSelectedStationId(station.id) }}
                >
                  <Popup>
                    <div className="map-popup">
                      <strong>{station.name}</strong>
                      <span>PM2.5: {formatValue(value)} µg/m³</span>
                      <span>PM10: {formatValue(airData[station.id]?.pm10)} µg/m³</span>
                      <span>{status.label}</span>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>

        <div className="map-legend">
          <strong>PM2.5 STATUS</strong>
          <span><i className="legend-dot good" /> Good <small>&lt;25</small></span>
          <span><i className="legend-dot moderate" /> Moderate <small>25–49</small></span>
          <span><i className="legend-dot high" /> High <small>50–99</small></span>
          <span><i className="legend-dot critical" /> Very high <small>100+</small></span>
        </div>

        <aside className={`data-drawer ${viewAll ? "expanded" : ""}`}>
          <div className="drawer-heading">
            <div>
              <div className="eyebrow">LIVE DATA</div>
              <h2>{viewAll ? "All monitoring areas" : selectedStation.name}</h2>
              <p>{viewAll ? "Select an area to inspect details" : "Selected monitoring area"}</p>
            </div>
            <button className="icon-button" onClick={() => setViewAll(!viewAll)} aria-label={viewAll ? "Show selected area" : "View all areas"} type="button">
              {viewAll ? "×" : "↗"}
            </button>
          </div>

          {viewAll ? (
            <>
              <div className="drawer-summary">
                <div><span>Areas online</span><strong>{availableValues.length}<small> / 12</small></strong></div>
                <div><span>Average PM2.5</span><strong>{formatValue(averagePM25)}<small> µg/m³</small></strong></div>
              </div>
              <div className="station-list-heading">
                <span>AREA</span><span>PM2.5</span>
              </div>
              <div className="drawer-station-list">
                {stationValues.map((station) => {
                  const status = statusFor(station.pm25);
                  return (
                    <button
                      type="button"
                      key={station.id}
                      className={`drawer-station ${station.id === selectedStationId ? "selected" : ""}`}
                      onClick={() => setSelectedStationId(station.id)}
                    >
                      <span className={`station-dot ${status.className}`} />
                      <span className="station-label">{station.name}<small>{status.label}</small></span>
                      <strong>{formatValue(station.pm25)}</strong>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="selected-value">
                <div className="value-heading">CURRENT PM2.5</div>
                <div className="large-value">{loading && currentPM25 == null ? "…" : formatValue(currentPM25)}<span>µg/m³</span></div>
                <span className={`status-pill ${statusFor(currentPM25).className}`}>
                  <i className="legend-dot" /> {statusFor(currentPM25).label}
                </span>
              </div>

              <div className="metric-pair">
                <div className="metric-tile">
                  <span>PM10</span>
                  <strong>{formatValue(selectedData?.pm10)} <small>µg/m³</small></strong>
                </div>
                <div className="metric-tile">
                  <span>Next hour</span>
                  <strong>{formatValue(nextHourPM25)} <small>µg/m³</small></strong>
                </div>
              </div>

              <div className="forecast-card">
                <div className="forecast-title-row">
                  <div>
                    <div className="eyebrow">FORECAST · +1 HOUR</div>
                    <h3>Next Hour Forecast</h3>
                  </div>
                  <span className="forecast-arrow">↗</span>
                </div>
                <div className="forecast-big-number">{formatValue(nextHourPM25)}<span>µg/m³</span></div>
                <div className="forecast-delta">
                  <span className={change != null && change > 0 ? "delta-up" : "delta-down"}>
                    {change == null ? "--" : `${change > 0 ? "+" : ""}${change.toFixed(1)} µg/m³`}
                  </span>
                  <span>{changePercent == null ? "" : `(${changePercent > 0 ? "+" : ""}${changePercent.toFixed(1)}%)`}</span>
                  <small>compared with current hour</small>
                </div>
                <div className="forecast-note">
                  Forecast values are provided by Open-Meteo, not by a custom-trained AI model.
                </div>
              </div>

              <div className="chart-section">
                <div className="chart-heading">
                  <div>
                    <h3>PM2.5 trend</h3>
                    <p>Hourly data for {selectedStation.name}</p>
                  </div>
                  <div className="time-filter">
                    {["24H", "7D", "30D"].map((item) => (
                      <button key={item} type="button" className={period === item ? "selected" : ""} onClick={() => setPeriod(item)}>{item}</button>
                    ))}
                  </div>
                </div>
                {period === "24H" ? (
                  <div className="chart-box">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={visibleChartData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                        <CartesianGrid stroke="#263247" strokeDasharray="3 3" />
                        <XAxis dataKey="time" tick={{ fill: "#8391a8", fontSize: 10 }} minTickGap={24} />
                        <YAxis tick={{ fill: "#8391a8", fontSize: 10 }} />
                        <Tooltip contentStyle={{ background: "#111827", border: "1px solid #334155", borderRadius: 8, color: "#f8fafc" }} />
                        <Line type="monotone" dataKey="pm25" name="PM2.5" stroke="#38bdf8" strokeWidth={2} dot={false} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="history-placeholder">
                    <strong>{period} history not loaded yet</strong>
                    <span>This API request contains only 24 hours of history. Connect a historical API or save hourly values in a backend to enable this range.</span>
                  </div>
                )}
              </div>

              {highestStation && (
                <div className="highest-area">
                  <span>Highest PM2.5 area now</span>
                  <strong>{highestStation.name} · {formatValue(highestStation.pm25)} µg/m³</strong>
                </div>
              )}
            </>
          )}
          {error && <div className="api-error">{error}</div>}
          {loading && <div className="loading-note">Fetching data from Open-Meteo…</div>}
          <button className="view-all-button" type="button" onClick={() => setViewAll(!viewAll)}>
            {viewAll ? "Back to selected area" : "View all 12 areas"} <span>→</span>
          </button>
        </aside>

        <div className="map-credit">Map tiles © OpenStreetMap contributors</div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
