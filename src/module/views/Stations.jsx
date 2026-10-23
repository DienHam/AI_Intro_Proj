import { useMemo, useState } from "react";
import { formatValue, statusFor } from "../aqi";

const COLUMNS = [
  ["name", "Area"],
  ["pm25", "PM2.5"],
  ["pm10", "PM10"],
  ["status", "Status"],
  ["next", "Next hour"],
  ["delta", "Change"]
];

export default function Stations({ stationValues, selectedId, onOpenStation }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "pm25", dir: "desc" });

  const rows = useMemo(() => {
    const list = stationValues.map((s) => ({
      ...s,
      next: s.nextHourPM25,
      delta: s.pm25 != null && s.nextHourPM25 != null ? s.nextHourPM25 - s.pm25 : null
    }));
    const key = sort.key === "status" ? "pm25" : sort.key;
    const dir = sort.dir === "asc" ? 1 : -1;
    return list
      .filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => {
        if (key === "name") return a.name.localeCompare(b.name) * dir;
        if (a[key] == null) return 1;
        if (b[key] == null) return -1;
        return (a[key] - b[key]) * dir;
      });
  }, [stationValues, query, sort]);

  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  }

  return (
    <article className="card">
      <div className="card-head">
        <div><h3>All monitoring areas</h3><p>{rows.length} / {stationValues.length} khu vực · bấm tiêu đề cột để sắp xếp</p></div>
        <input
          className="search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm khu vực…"
          aria-label="Tìm khu vực"
        />
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {COLUMNS.map(([key, label]) => (
                <th key={key} className={key === "name" ? "" : "num"} aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" onClick={() => toggleSort(key)}>
                    {label}{sort.key === key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const status = statusFor(s.pm25);
              return (
                <tr key={s.id} className={s.id === selectedId ? "selected" : ""} onClick={() => onOpenStation(s.id)}>
                  <td><span className="dot" style={{ background: status.color }} />{s.name}</td>
                  <td className="num strong">{formatValue(s.pm25)}</td>
                  <td className="num">{formatValue(s.pm10)}</td>
                  <td className="num"><span className={`pill ${status.className}`}><i />{status.label}</span></td>
                  <td className="num">{formatValue(s.next)}</td>
                  <td className={`num ${s.delta == null ? "" : s.delta > 0.4 ? "up" : s.delta < -0.4 ? "down" : ""}`}>
                    {s.delta == null ? "--" : `${s.delta > 0 ? "+" : ""}${s.delta.toFixed(1)}`}
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={6} className="empty-row">Không tìm thấy khu vực phù hợp.</td></tr>}
          </tbody>
        </table>
      </div>
    </article>
  );
}
