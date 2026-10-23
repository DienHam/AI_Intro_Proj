import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from "recharts";
import "./index.css";
import "./module/views/views.css";
import StationMap from "./module/StationMap";
import Chat from "./module/Chat/Chat";
import Overview from "./module/views/Overview";
import Stations from "./module/views/Stations";
import AirQuality from "./module/views/AirQuality";
import Forecast from "./module/views/Forecast";
import Historical from "./module/views/Historical";
import { axisTick, tooltipStyle } from "./module/views/chartStyle";
import { BANDS, PAST_HOURS, formatValue, seriesFor, statusFor } from "./module/aqi";
import {
  IconAir,
  IconArrowRight,
  IconClose,
  IconForecast,
  IconHistory,
  IconLogout,
  IconMap,
  IconPulse,
  IconStations
} from "./module/Icons";

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

const MODULES = [
  { key: "Overview", label: "Overview", Icon: IconPulse, title: "Overview", subtitle: "Hà Nội hôm nay trong một cái nhìn" },
  { key: "Map", label: "Map", Icon: IconMap, title: "Air Quality Map", subtitle: "PM2.5 và PM10 theo mô hình · 12 khu vực" },
  { key: "Stations", label: "Stations", Icon: IconStations, title: "Monitoring Areas", subtitle: "So sánh và sắp xếp các khu vực" },
  { key: "Air Quality", label: "Air quality", Icon: IconAir, title: "Air Quality", subtitle: "Mức độ, ngưỡng WHO và khuyến nghị" },
  { key: "Forecast", label: "Forecast", Icon: IconForecast, title: "Forecast", subtitle: "PM2.5 giờ tiếp theo" },
  { key: "Historical Data", label: "History", Icon: IconHistory, title: "Historical Data", subtitle: "Xem lại, so sánh và tải về" }
];

const mean = (list) => (list.length ? list.reduce((sum, v) => sum + Number(v), 0) / list.length : null);

function Dashboard({ user, onLogout, onHome }) {
  const [airData, setAirData] = useState({});
  const [selectedStationId, setSelectedStationId] = useState(2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdate, setLastUpdate] = useState(null);
  const [viewAll, setViewAll] = useState(false);
  const [showLive, setShowLive] = useState(true);
  const [showHeat, setShowHeat] = useState(true);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [activeModule, setActiveModule] = useState("Overview");
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
          `&past_hours=${PAST_HOURS}&forecast_hours=2` +
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
          // With past_hours=PAST_HOURS, index PAST_HOURS is normally the current hour.
          const currentIndex = Math.min(PAST_HOURS, Math.max(0, times.length - 1));
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

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") setMapExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const stationValues = useMemo(
    () => stations.map((station) => ({ ...station, ...(airData[station.id] ?? {}) })),
    [airData]
  );

  const selectedStation = stationValues.find((station) => station.id === selectedStationId) ?? stationValues[0];
  const currentPM25 = selectedStation.pm25 ?? null;
  const nextHourPM25 = selectedStation.nextHourPM25 ?? null;
  const change = currentPM25 != null && nextHourPM25 != null ? nextHourPM25 - currentPM25 : null;
  const changePercent = currentPM25 > 0 && change != null ? (change / currentPM25) * 100 : null;

  // Hanoi-wide average at every hourly index (stations share the same time axis).
  const cityAvg = useMemo(() => {
    const length = Math.max(0, ...stationValues.map((s) => s.pm25History?.length ?? 0));
    return Array.from({ length }, (_, i) => {
      const values = stationValues.map((s) => s.pm25History?.[i]).filter((v) => v != null && Number.isFinite(Number(v)));
      return values.length ? mean(values) : null;
    });
  }, [stationValues]);

  const city = useMemo(() => {
    const live = stationValues.filter((s) => s.pm25 != null && Number.isFinite(Number(s.pm25)));
    const sorted = [...live].sort((a, b) => b.pm25 - a.pm25);
    return {
      count: live.length,
      avg25: mean(live.map((s) => s.pm25)),
      avg10: mean(stationValues.map((s) => s.pm10).filter((v) => v != null)),
      avgNext: mean(stationValues.map((s) => s.nextHourPM25).filter((v) => v != null)),
      highest: sorted[0] ?? null,
      lowest: sorted[sorted.length - 1] ?? null
    };
  }, [stationValues]);

  const drawerSeries = useMemo(
    () => seriesFor(selectedStation, period === "7D" ? 168 : 24),
    [selectedStation, period]
  );

  function openStation(id) {
    setSelectedStationId(id);
    setActiveModule("Map");
  }

  const current = MODULES.find((m) => m.key === activeModule) ?? MODULES[0];
  const isMap = activeModule === "Map";
  const wide = isMap && mapExpanded;
  const statusText = error ? "API unavailable" : loading ? "Updating data" : "Last updated";
  const stationProps = { stationValues, selectedId: selectedStationId, onSelect: setSelectedStationId };

  return (
    <div className={`page ${wide ? "wide" : ""}`}>
      <div className="dashboard">
        <nav className="rail" aria-label="Main modules">
          <button className="brand-mark" type="button" onClick={onHome} title="Về trang giới thiệu" aria-label="Về trang giới thiệu">AQ</button>
          {MODULES.map(({ key, label, Icon }) => (
            <button
              key={key}
              className={`rail-link ${activeModule === key ? "active" : ""}`}
              onClick={() => setActiveModule(key)}
              aria-current={activeModule === key ? "page" : undefined}
              type="button"
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
          <div className="rail-status" title={error ? "API unavailable" : loading ? "Connecting…" : "Open-Meteo API online"}>
            <span className={`online-dot ${loading || error ? "muted" : ""}`} />
          </div>
          {user && (
            <div className="rail-user">
              <span className="avatar" title={user.guest ? "Khách" : `${user.name} · ${user.email}`}>
                {(user.name || "K").trim().charAt(0).toUpperCase()}
              </span>
              <button type="button" className="rail-logout" onClick={onLogout} aria-label="Đăng xuất" title="Đăng xuất">
                <IconLogout size={18} />
              </button>
            </div>
          )}
        </nav>

        <div className="main">
          <header className="header">
            <div>
              <div className="eyebrow">HANOI · REAL-TIME MONITORING</div>
              <h1>{current.title}</h1>
              <p>{current.subtitle}</p>
            </div>
            <div className="header-tools">
              <div className="update-chip">
                <span className={`online-dot ${loading || error ? "muted" : ""}`} />
                <div>
                  <span>{statusText}</span>
                  <strong>{lastUpdate ? lastUpdate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</strong>
                </div>
              </div>
              {isMap && (
                <>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showHeat}
                    className={`live-toggle ${showHeat ? "on" : ""}`}
                    onClick={() => setShowHeat((v) => !v)}
                  >
                    <span className="switch"><i /></span>
                    Heatmap
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showLive}
                    className={`live-toggle ${showLive ? "on" : ""}`}
                    onClick={() => setShowLive((v) => !v)}
                  >
                    <span className="switch"><i /></span>
                    Live data
                  </button>
                </>
              )}
            </div>
          </header>

          {error && !isMap && <div className="banner">{error}</div>}

          {isMap ? (
            <div className="stage">
              <StationMap stations={stationValues} selectedId={selectedStationId} onSelect={setSelectedStationId} heat={showHeat} onToggleHeat={() => setShowHeat((v) => !v)} expanded={mapExpanded} onToggleExpand={() => setMapExpanded((v) => !v)} />

              <div className="map-legend">
                <strong>PM2.5</strong>
                {BANDS.map((band) => (
                  <span key={band.className}><i style={{ background: band.color }} />{band.label}<small>{band.range}</small></span>
                ))}
              </div>

              <aside className={`drawer ${showLive ? "open" : ""} ${viewAll ? "expanded" : ""}`} aria-hidden={!showLive}>
                <div className="drawer-heading">
                  <div>
                    <div className="eyebrow">LIVE DATA</div>
                    <h2>{viewAll ? "All monitoring areas" : selectedStation.name}</h2>
                  </div>
                  <button className="icon-button" onClick={() => setShowLive(false)} aria-label="Hide live data" type="button">
                    <IconClose size={16} />
                  </button>
                </div>

                <div className="drawer-body">
                  {viewAll ? (
                    <>
                      <div className="drawer-summary">
                        <div><span>Areas online</span><strong>{city.count}<small> / 12</small></strong></div>
                        <div><span>Average PM2.5</span><strong>{formatValue(city.avg25)}<small> µg/m³</small></strong></div>
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
                              <span className="dot" style={{ background: status.color }} />
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
                        <span className="eyebrow">CURRENT PM2.5</span>
                        <div className="large-value">{loading && currentPM25 == null ? "…" : formatValue(currentPM25)}<span>µg/m³</span></div>
                        <span className={`pill ${statusFor(currentPM25).className}`}><i />{statusFor(currentPM25).label}</span>
                      </div>

                      <div className="metric-pair">
                        <div className="metric-tile"><span>PM10</span><strong>{formatValue(selectedStation.pm10)}<small> µg/m³</small></strong></div>
                        <div className="metric-tile"><span>Next hour</span><strong>{formatValue(nextHourPM25)}<small> µg/m³</small></strong></div>
                      </div>

                      <div className="forecast-card">
                        <span className="eyebrow">FORECAST · +1 HOUR</span>
                        <div className="forecast-line">
                          <strong>{formatValue(nextHourPM25)}</strong>
                          <span className={change != null && change > 0 ? "up" : "down"}>
                            {change == null ? "--" : `${change > 0 ? "+" : ""}${change.toFixed(1)}`}
                            {changePercent != null && ` (${changePercent > 0 ? "+" : ""}${changePercent.toFixed(1)}%)`}
                          </span>
                        </div>
                        <p>Forecast values are provided by Open-Meteo, not by a custom-trained model.</p>
                      </div>

                      <div className="drawer-chart">
                        <div className="drawer-chart-head">
                          <h3>PM2.5 trend</h3>
                          <div className="segmented small" role="group" aria-label="Range">
                            {["24H", "7D"].map((item) => (
                              <button key={item} type="button" className={period === item ? "on" : ""} onClick={() => setPeriod(item)}>{item}</button>
                            ))}
                          </div>
                        </div>
                        <div className="chart-box small">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={drawerSeries} margin={{ top: 6, right: 6, left: -26, bottom: 0 }}>
                              <CartesianGrid stroke="#eeebe3" vertical={false} />
                              <XAxis dataKey="axis" tick={axisTick} tickLine={false} axisLine={false} minTickGap={32} />
                              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
                              <Tooltip contentStyle={tooltipStyle} labelFormatter={(_, p) => p?.[0]?.payload?.full} formatter={(v, name) => [`${Number(v).toFixed(1)} µg/m³`, name]} />
                              <Line type="monotone" dataKey="hist" name="Measured" stroke="#2f6f5e" strokeWidth={2} dot={false} connectNulls />
                              <Line type="monotone" dataKey="fc" name="Forecast" stroke="#e8833a" strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </>
                  )}
                  {error && <div className="api-error">{error}</div>}
                </div>

                <button className="view-all-button" type="button" onClick={() => setViewAll((v) => !v)}>
                  {viewAll ? "Back to selected area" : "View all 12 areas"} <IconArrowRight size={16} />
                </button>
              </aside>
            </div>
          ) : (
            <div className="view" key={activeModule}>
              {activeModule === "Overview" && (
                <Overview {...stationProps} city={city} cityAvg={cityAvg} onOpenStation={openStation} />
              )}
              {activeModule === "Stations" && <Stations {...stationProps} onOpenStation={openStation} />}
              {activeModule === "Air Quality" && <AirQuality city={city} stationValues={stationValues} />}
              {activeModule === "Forecast" && <Forecast {...stationProps} city={city} cityAvg={cityAvg} />}
              {activeModule === "Historical Data" && <Historical {...stationProps} cityAvg={cityAvg} />}
            </div>
          )}
        </div>
      </div>

      <Chat stations={stationValues} selected={selectedStation} />
    </div>
  );
}

export default Dashboard;
