import { formatValue, heatColor, statusFor } from "./aqi";

// WHO 2021 guideline for the 24-hour mean of PM2.5.
export const WHO_PM25 = 15;

export const VI_LEVEL = { good: "tốt", moderate: "trung bình", high: "cao", critical: "rất cao", unknown: "chưa có số liệu" };

const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const pad = (n) => String(n).padStart(2, "0");
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const valid = (v) => v != null && Number.isFinite(Number(v));

export const rgb = (value) => `rgb(${heatColor(value).map(Math.round).join(",")})`;

/** Hanoi-wide average for every hour up to now, oldest first. */
export function buildCitySeries(stationValues, cityAvg) {
  const ref = stationValues.find((s) => s.times);
  if (!ref) return [];
  const series = [];
  for (let i = 0; i <= ref.currentIndex; i += 1) {
    const date = new Date(ref.times[i]);
    series.push({
      ts: ref.times[i],
      hour: date.getHours(),
      day: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`,
      dow: DOW[date.getDay()],
      axis: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`,
      full: `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:00`,
      value: valid(cityAvg[i]) ? Number(cityAvg[i]) : null
    });
  }
  return series;
}

/** Average PM2.5 for each hour of the day across the whole window. */
export function hourProfile(series) {
  return Array.from({ length: 24 }, (_, hour) => {
    const values = series.filter((p) => p.hour === hour && p.value != null).map((p) => p.value);
    return { hour, label: `${pad(hour)}h`, value: values.length ? mean(values) : null };
  });
}

/** One row per day, 24 cells each, for the calendar heatmap. */
export function dayHourGrid(series) {
  const days = [];
  for (const point of series) {
    let row = days.find((d) => d.day === point.day);
    if (!row) {
      row = { day: point.day, label: `${point.dow} ${point.day}`, cells: Array(24).fill(null) };
      days.push(row);
    }
    row.cells[point.hour] = point;
  }
  return days;
}

function spatial(stationValues) {
  const live = stationValues.filter((s) => valid(s.pm25));
  if (live.length < 4) return null;
  const median = (key) => [...live].map((s) => s[key]).sort((a, b) => a - b)[Math.floor(live.length / 2)];
  const lng = median("lng");
  const lat = median("lat");
  const side = (test) => mean(live.filter(test).map((s) => Number(s.pm25)));
  const west = side((s) => s.lng < lng);
  const east = side((s) => s.lng >= lng);
  const south = side((s) => s.lat < lat);
  const north = side((s) => s.lat >= lat);
  const ew = west - east;
  const ns = north - south;
  const useEw = Math.abs(ew) >= Math.abs(ns);
  const diff = useEw ? ew : ns;
  const high = useEw ? (ew > 0 ? "Tây" : "Đông") : ns > 0 ? "Bắc" : "Nam";
  const low = useEw ? (ew > 0 ? "Đông" : "Tây") : ns > 0 ? "Nam" : "Bắc";
  return { high, low, diff: Math.abs(diff) };
}

/** Everything the overview says in words, computed from the series and the latest readings. */
export function buildInsights({ city, stationValues, series }) {
  const last = series[series.length - 1];
  const now = last?.value ?? city.avg25;
  const level = statusFor(now);
  const profile = hourProfile(series);
  const known = profile.filter((p) => p.value != null);
  const peak = known.reduce((best, p) => (best == null || p.value > best.value ? p : best), null);
  const low = known.reduce((best, p) => (best == null || p.value < best.value ? p : best), null);
  const usual = last ? profile[last.hour]?.value : null;
  const yesterday = series[series.length - 25]?.value ?? null;
  const threeAgo = series[series.length - 4]?.value ?? null;
  const space = spatial(stationValues);

  const risers = stationValues
    .filter((s) => valid(s.pm25) && valid(s.pm25History?.[s.currentIndex - 24]))
    .map((s) => ({ name: s.name, delta: Number(s.pm25) - Number(s.pm25History[s.currentIndex - 24]) }))
    .sort((a, b) => b.delta - a.delta);
  const nextDeltas = stationValues
    .filter((s) => valid(s.pm25) && valid(s.nextHourPM25))
    .map((s) => Number(s.nextHourPM25) - Number(s.pm25));
  const rising = nextDeltas.filter((d) => d > 0.4).length;
  const falling = nextDeltas.filter((d) => d < -0.4).length;
  const nextCity = city.avgNext;

  const times = now != null ? now / WHO_PM25 : null;
  const vsYesterday = now != null && yesterday != null ? now - yesterday : null;

  const headline = {
    level,
    title:
      now == null
        ? "Chưa có số liệu để nhận định"
        : `Không khí Hà Nội đang ở mức ${VI_LEVEL[level.className]}`,
    text:
      now == null
        ? "Hãy thử tải lại trang."
        : `PM2.5 trung bình ${formatValue(now)} µg/m³, gấp ${times.toFixed(1)} lần ngưỡng khuyến nghị 24 giờ của WHO (${WHO_PM25} µg/m³).` +
          (vsYesterday == null
            ? ""
            : Math.abs(vsYesterday) < 0.5
              ? " Gần như bằng cùng giờ hôm qua."
              : ` So với cùng giờ hôm qua, ${vsYesterday > 0 ? "cao hơn" : "thấp hơn"} ${Math.abs(vsYesterday).toFixed(1)} µg/m³.`),
    times,
    vsYesterday
  };

  const cards = [];

  if (peak && low) {
    const rel = now != null && usual != null ? now - usual : null;
    cards.push({
      key: "rhythm",
      kicker: "Nhịp trong ngày",
      stat: peak.label.replace("h", ":00"),
      statNote: "giờ cao nhất",
      text:
        `Trung bình ${series.length > 48 ? "nhiều ngày qua" : "hôm nay"}, bụi mịn cao nhất lúc ${peak.label.replace("h", ":00")} (${formatValue(peak.value)}) và thấp nhất lúc ${low.label.replace("h", ":00")} (${formatValue(low.value)}).` +
        (rel == null ? "" : Math.abs(rel) < 1 ? " Giờ này đang ở mức thường thấy." : ` Giờ này đang ${rel > 0 ? "cao hơn" : "thấp hơn"} thường lệ ${Math.abs(rel).toFixed(1)}.`)
    });
  }

  if (space) {
    cards.push({
      key: "space",
      kicker: "Phân bố không gian",
      stat: space.diff < 1 ? "Đều" : space.high,
      statNote: space.diff < 1 ? "giữa các khu" : "cao hơn",
      text:
        space.diff < 1
          ? "Các khu vực đang khá đồng đều, chênh nhau dưới 1 µg/m³ giữa các phía của thành phố."
          : `Phía ${space.high} đang cao hơn phía ${space.low} khoảng ${space.diff.toFixed(1)} µg/m³.`
    });
  }

  if (threeAgo != null || nextCity != null) {
    const d3 = now != null && threeAgo != null ? now - threeAgo : null;
    const dn = now != null && nextCity != null ? nextCity - now : null;
    cards.push({
      key: "trend",
      kicker: "Xu hướng",
      stat: d3 == null ? "--" : `${d3 > 0 ? "+" : ""}${d3.toFixed(1)}`,
      statNote: "so với 3 giờ trước",
      text:
        (dn == null
          ? ""
          : Math.abs(dn) < 0.5
            ? "Giờ tới dự kiến gần như không đổi. "
            : `Giờ tới dự kiến ${dn > 0 ? "tăng" : "giảm"} ${Math.abs(dn).toFixed(1)} µg/m³. `) +
        (rising + falling ? `${rising} khu vực tăng, ${falling} khu vực giảm.` : "")
    });
  }

  if (risers.length) {
    const top = risers[0];
    const bottom = risers[risers.length - 1];
    cards.push({
      key: "movers",
      kicker: "Biến động 24 giờ",
      stat: top.delta > 0 ? top.name : bottom.name,
      statNote: top.delta > 0 ? "tăng nhiều nhất" : "giảm nhiều nhất",
      text:
        top.delta > 0
          ? `${top.name} tăng ${top.delta.toFixed(1)} µg/m³ so với 24 giờ trước. ${bottom.delta < 0 ? `${bottom.name} giảm nhiều nhất (${bottom.delta.toFixed(1)}).` : ""}`
          : `Mọi khu vực đều thấp hơn 24 giờ trước. ${bottom.name} giảm nhiều nhất (${bottom.delta.toFixed(1)}).`
    });
  }

  return { headline, cards, profile, now, usualHour: last?.hour ?? null };
}
