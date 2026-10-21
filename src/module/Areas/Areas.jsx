import { useMemo, useState } from "react";
import "./Areas.css";

function statusFor(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return {
      label: "No data",
      className: "unknown"
    };
  }

  if (value < 25) {
    return {
      label: "Good",
      className: "good"
    };
  }

  if (value < 50) {
    return {
      label: "Moderate",
      className: "moderate"
    };
  }

  if (value < 100) {
    return {
      label: "High",
      className: "high"
    };
  }

  return {
    label: "Very high",
    className: "critical"
  };
}

function formatValue(value) {
  return value == null || !Number.isFinite(Number(value))
    ? "--"
    : Number(value).toFixed(1);
}

export default function Areas({
  stationValues = [],
  selectedStationId,
  onSelectStation,
  loading,
  error,
  lastUpdate
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [sortBy, setSortBy] = useState("name");

  const filteredAreas = useMemo(() => {
    let result = stationValues.filter((station) =>
      station.name.toLowerCase().includes(search.toLowerCase())
    );

    if (filter !== "All") {
      result = result.filter(
        (station) => statusFor(station.pm25).label === filter
      );
    }

    result = [...result].sort((a, b) => {
      if (sortBy === "pm25") {
        return (b.pm25 ?? -Infinity) - (a.pm25 ?? -Infinity);
      }

      return a.name.localeCompare(b.name);
    });

    return result;
  }, [stationValues, search, filter, sortBy]);

  const onlineCount = stationValues.filter(
    (station) => station.pm25 != null
  ).length;

  const average =
    stationValues
      .filter((station) => station.pm25 != null)
      .reduce((sum, station) => sum + Number(station.pm25), 0) /
    (onlineCount || 1);

  return (
    <section className="areas-module">
      <header className="areas-header">
        <div>
          <div className="eyebrow">HANOI / AREAS</div>

          <h1>Monitoring Areas</h1>

          <p>
            Real-time air-quality conditions across 12 Hanoi areas.
          </p>
        </div>

        <div className="areas-header-status">
          <span
            className={`online-dot ${
              loading || error ? "muted" : ""
            }`}
          />

          <div>
            <span>
              {error
                ? "API unavailable"
                : loading
                ? "Updating data"
                : "Last updated"}
            </span>

            <strong>
              {lastUpdate
                ? lastUpdate.toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit"
                  })
                : "--:--"}
            </strong>
          </div>
        </div>
      </header>

      <div className="areas-toolbar">
        <div className="areas-search">
          <span>⌕</span>

          <input
            type="text"
            placeholder="Search area..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="areas-filters">
          {[
            "All",
            "Good",
            "Moderate",
            "High",
            "Very high"
          ].map((item) => (
            <button
              key={item}
              type="button"
              className={filter === item ? "active" : ""}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <select
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value)}
          className="areas-sort"
        >
          <option value="name">Sort: Name</option>
          <option value="pm25">Sort: PM2.5</option>
        </select>
      </div>

      <div className="areas-summary">
        <div className="areas-summary-card">
          <span>Total areas</span>
          <strong>{stationValues.length}</strong>
        </div>

        <div className="areas-summary-card">
          <span>Areas online</span>
          <strong>
            {onlineCount}
            <small> / {stationValues.length}</small>
          </strong>
        </div>

        <div className="areas-summary-card">
          <span>Average PM2.5</span>
          <strong>
            {onlineCount ? average.toFixed(1) : "--"}
            <small> µg/m³</small>
          </strong>
        </div>
      </div>

      {error && (
        <div className="areas-error">
          <strong>Unable to load live data</strong>
          <span>{error}</span>
        </div>
      )}

      <div className="areas-grid">
        {filteredAreas.map((station) => {
          const status = statusFor(station.pm25);

          const isSelected =
            station.id === selectedStationId;

          return (
            <button
              key={station.id}
              type="button"
              className={`area-card ${
                isSelected ? "selected" : ""
              }`}
              onClick={() => onSelectStation(station.id)}
            >
              <div className="area-card-top">
                <div>
                  <span
                    className={`area-status-dot ${status.className}`}
                  />

                  <h2>{station.name}</h2>

                  <span className="area-location">
                    Hanoi, Vietnam
                  </span>
                </div>

                <span
                  className={`area-status ${status.className}`}
                >
                  {status.label}
                </span>
              </div>

              <div className="area-metrics">
                <div>
                  <span>PM2.5</span>

                  <strong>
                    {formatValue(station.pm25)}
                    <small> µg/m³</small>
                  </strong>
                </div>

                <div>
                  <span>PM10</span>

                  <strong>
                    {formatValue(station.pm10)}
                    <small> µg/m³</small>
                  </strong>
                </div>
              </div>

              <div className="area-card-footer">
                <span>
                  {station.times?.length
                    ? "Hourly data available"
                    : "No hourly data"}
                </span>

                <span className="area-open">
                  View details →
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {filteredAreas.length === 0 && (
        <div className="areas-empty">
          <strong>No areas found</strong>

          <span>
            Try another search term or filter.
          </span>
        </div>
      )}
    </section>
  );
}