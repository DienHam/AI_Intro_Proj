export const PAST_HOURS = 168;

export const BANDS = [
  { className: "good", label: "Good", range: "< 25", min: 0, max: 25, color: "#22c55e" },
  { className: "moderate", label: "Moderate", range: "25 – 49", min: 25, max: 50, color: "#eab308" },
  { className: "high", label: "High", range: "50 – 99", min: 50, max: 100, color: "#f97316" },
  { className: "critical", label: "Very high", range: "100+", min: 100, max: Infinity, color: "#ef4444" }
];

export const ADVICE = {
  good: "Không khí tốt, bạn có thể sinh hoạt ngoài trời bình thường.",
  moderate: "Mức trung bình. Người nhạy cảm (trẻ nhỏ, người già, người có bệnh hô hấp) nên hạn chế vận động mạnh ngoài trời quá lâu.",
  high: "Mức cao. Nên đeo khẩu trang lọc bụi mịn (N95/KN95) khi ra ngoài và hạn chế tập thể dục ngoài trời.",
  critical: "Mức rất cao. Nên hạn chế ra ngoài, đóng cửa sổ và dùng máy lọc không khí nếu có.",
  unknown: "Hiện chưa có số liệu để đưa ra lời khuyên."
};

export function statusFor(value) {
  if (value == null || Number.isNaN(Number(value))) return { label: "No data", className: "unknown", color: "#9aa09b" };
  const band = BANDS.find((b) => value >= b.min && value < b.max) ?? BANDS[0];
  return { label: band.label, className: band.className, color: band.color };
}

export function formatValue(value) {
  return value == null || !Number.isFinite(Number(value)) ? "--" : Number(value).toFixed(1);
}

const pad = (n) => String(n).padStart(2, "0");

export function timeParts(iso) {
  const d = new Date(iso);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const day = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  return { hm, day, full: `${day} ${hm}` };
}

/**
 * Hourly points for one station: the last `hours` hours up to now, plus the next-hour forecast.
 * `hist` stops at the current hour and `fc` starts there, so the two lines join.
 */
export function seriesFor(station, hours, cityAvg = []) {
  if (!station?.times) return [];
  const end = Math.min(station.times.length, station.currentIndex + 2);
  const start = Math.max(0, station.currentIndex - hours + 1);
  const points = [];
  for (let i = start; i < end; i += 1) {
    const { hm, day, full } = timeParts(station.times[i]);
    const value = station.pm25History?.[i] ?? null;
    const isForecast = i > station.currentIndex;
    points.push({
      ts: station.times[i],
      axis: hours > 24 ? day : hm,
      full,
      pm25: value,
      pm10: station.pm10History?.[i] ?? null,
      city: cityAvg[i] ?? null,
      hist: isForecast ? null : value,
      fc: i >= station.currentIndex ? value : null,
      isForecast
    });
  }
  return points;
}

export function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// A continuous ramp. Most Hanoi readings sit around 25-30, so that stretch goes green to
// lime instead of jumping to yellow, which turns muddy over the map.
const HEAT_STOPS = [
  [15, [34, 197, 94]],
  [28, [132, 204, 22]],
  [42, [250, 204, 21]],
  [60, [249, 115, 22]],
  [100, [239, 68, 68]],
  [150, [185, 28, 28]]
];

export function heatColor(value) {
  if (value <= HEAT_STOPS[0][0]) return HEAT_STOPS[0][1];
  for (let i = 1; i < HEAT_STOPS.length; i += 1) {
    const [v1, c1] = HEAT_STOPS[i];
    if (value <= v1) {
      const [v0, c0] = HEAT_STOPS[i - 1];
      const t = (value - v0) / (v1 - v0);
      return c0.map((channel, k) => channel + (c1[k] - channel) * t);
    }
  }
  return HEAT_STOPS[HEAT_STOPS.length - 1][1];
}

