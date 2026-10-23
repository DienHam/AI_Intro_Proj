import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Popup, ImageOverlay, Pane, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { formatValue, heatColor, statusFor } from "./aqi";
import { IconExpand, IconLayers, IconMinus, IconPlus, IconShrink, IconTarget } from "./Icons";

const CENTER = [21.0285, 105.8342];

// The heatmap is drawn once onto a canvas covering this box, then stretched by Leaflet.
const HEAT_BOUNDS = [[20.84, 105.64], [21.22, 106.02]];
const HEAT_SIZE = 256;
const HEAT_FULL = 0.05; // degrees from a station where the colour is fully opaque
const HEAT_FADE = 0.15; // degrees from a station where it has faded out
const HEAT_ALPHA = 0.5;

/** Inverse-distance-weighted PM2.5 surface between stations, as a PNG data URL. */
function buildHeatImage(points) {
  const canvas = document.createElement("canvas");
  canvas.width = HEAT_SIZE;
  canvas.height = HEAT_SIZE;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(HEAT_SIZE, HEAT_SIZE);
  const [[south, west], [north, east]] = HEAT_BOUNDS;

  for (let y = 0; y < HEAT_SIZE; y += 1) {
    const lat = north - ((y + 0.5) / HEAT_SIZE) * (north - south);
    for (let x = 0; x < HEAT_SIZE; x += 1) {
      const lng = west + ((x + 0.5) / HEAT_SIZE) * (east - west);
      let weightSum = 0;
      let valueSum = 0;
      let nearest = Infinity;
      for (const p of points) {
        const dist = Math.hypot(p.lat - lat, p.lng - lng);
        if (dist < nearest) nearest = dist;
        const weight = 1 / (dist * dist + 1e-6);
        weightSum += weight;
        valueSum += weight * p.value;
      }
      const t = Math.min(1, Math.max(0, (HEAT_FADE - nearest) / (HEAT_FADE - HEAT_FULL)));
      const fade = t * t * (3 - 2 * t);
      const [r, g, b] = heatColor(valueSum / weightSum);
      const i = (y * HEAT_SIZE + x) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = Math.round(255 * HEAT_ALPHA * fade);
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function HeatLayer({ stations }) {
  const url = useMemo(() => {
    const points = stations
      .filter((s) => s.pm25 != null && Number.isFinite(Number(s.pm25)))
      .map((s) => ({ lat: s.lat, lng: s.lng, value: Number(s.pm25) }));
    return points.length ? buildHeatImage(points) : null;
  }, [stations]);

  if (!url) return null;
  return (
    <Pane name="heat" style={{ zIndex: 350, pointerEvents: "none" }}>
      <ImageOverlay url={url} bounds={HEAT_BOUNDS} interactive={false} />
    </Pane>
  );
}

function FitHanoi({ zoom }) {
  const map = useMap();
  useEffect(() => {
    map.setView(CENTER, zoom);
    const timer = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(timer);
  }, [map, zoom]);
  return null;
}

function MapControls({ zoom, expanded, onToggleExpand, heat, onToggleHeat }) {
  const map = useMap();
  const ref = useRef(null);

  // Keep clicks and scrolls on the buttons from reaching the map underneath.
  useEffect(() => {
    if (!ref.current) return;
    L.DomEvent.disableClickPropagation(ref.current);
    L.DomEvent.disableScrollPropagation(ref.current);
  }, []);

  // The map container changes size when the dashboard expands or shrinks.
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 400);
    return () => clearTimeout(timer);
  }, [map, expanded]);

  return (
    <div className="map-controls" ref={ref}>
      <div className="map-ctl-group">
        <button type="button" onClick={() => map.zoomIn()} aria-label="Zoom in" title="Phóng to"><IconPlus size={20} /></button>
        <button type="button" onClick={() => map.zoomOut()} aria-label="Zoom out" title="Thu nhỏ"><IconMinus size={20} /></button>
      </div>
      <div className="map-ctl-group">
        {onToggleHeat && (
          <button
            type="button"
            className={heat ? "on" : ""}
            onClick={onToggleHeat}
            aria-pressed={heat}
            aria-label="Heatmap"
            title={heat ? "Tắt heatmap" : "Bật heatmap"}
          >
            <IconLayers size={20} />
          </button>
        )}
        <button type="button" onClick={() => map.flyTo(CENTER, zoom, { duration: 0.6 })} aria-label="Reset view" title="Về giữa Hà Nội"><IconTarget size={20} /></button>
        {onToggleExpand && (
          <button type="button" onClick={onToggleExpand} aria-label={expanded ? "Exit full width" : "Full width"} title={expanded ? "Thu gọn (Esc)" : "Mở rộng bản đồ"}>
            {expanded ? <IconShrink size={20} /> : <IconExpand size={20} />}
          </button>
        )}
      </div>
    </div>
  );
}

export default function StationMap({ stations, selectedId, onSelect, compact = false, heat = false, onToggleHeat, expanded = false, onToggleExpand }) {
  const zoom = compact ? 11.5 : 12;
  return (
    <MapContainer
      center={CENTER}
      zoom={zoom}
      minZoom={9}
      maxZoom={18}
      zoomSnap={0.25}
      zoomDelta={0.5}
      wheelPxPerZoomLevel={90}
      wheelDebounceTime={20}
      scrollWheelZoom={!compact}
      zoomControl={false}
      className="leaflet-map"
    >
      <FitHanoi zoom={zoom} />
      {!compact && (
        <MapControls zoom={zoom} expanded={expanded} onToggleExpand={onToggleExpand} heat={heat} onToggleHeat={onToggleHeat} />
      )}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {heat && <HeatLayer stations={stations} />}
      {stations.map((station) => {
        const status = statusFor(station.pm25);
        const selected = station.id === selectedId;
        return (
          <CircleMarker
            key={station.id}
            center={[station.lat, station.lng]}
            radius={selected ? 12 : 8}
            pathOptions={{
              color: selected ? "#ffffff" : status.color,
              weight: selected ? 3 : 2,
              fillColor: status.color,
              fillOpacity: 0.9
            }}
            eventHandlers={{ click: () => onSelect(station.id) }}
          >
            <Popup>
              <div className="map-popup">
                <strong>{station.name}</strong>
                <span>PM2.5 · {formatValue(station.pm25)} µg/m³</span>
                <span>PM10 · {formatValue(station.pm10)} µg/m³</span>
                <em>{status.label}</em>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
