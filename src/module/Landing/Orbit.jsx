import { useEffect, useRef, useState } from "react";
import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import { formatValue, statusFor } from "../aqi";
import { IconArrowRight } from "../Icons";
import "./Orbit.css";

const HANOI = [105.8342, 21.0285];

const BEATS = [
  { at: 0, tag: "Từ không gian", title: "Một hành tinh, một lớp khí quyển mỏng.", text: "Mọi thứ chúng ta hít vào đều đi qua lớp khí này." },
  { at: 0.24, tag: "Đông Nam Á", title: "Bụi mịn không biết đến biên giới.", text: "Gió mang nó đi xa hơn nhiều so với nơi nó sinh ra." },
  { at: 0.46, tag: "Việt Nam", title: "Và ở đây, không khí đổi từng giờ.", text: "Hãy cùng bay xuống một thành phố." },
  { at: 0.76, tag: "Hà Nội · 21.03°N 105.83°E", title: "Đây là nơi hành trình bắt đầu.", text: "12 khu vực, từng giờ, đang được theo dõi." }
];

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const wrap180 = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;

// Fixed star field, generated once so it does not flicker between renders.
const STARS = (() => {
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: 170 }, () => ({ x: rand(), y: rand(), r: 0.4 + rand() * 1.3, a: 0.25 + rand() * 0.6, tw: rand() * 6.28 }));
})();

function prepare(topo) {
  const countries = feature(topo, topo.objects.countries);
  return {
    land: feature(topo, topo.objects.land),
    borders: mesh(topo, topo.objects.countries, (a, b) => a !== b),
    vietnam: countries.features.find((f) => f.id === "704")
  };
}

export default function Orbit({ live, onStart }) {
  const sectionRef = useRef(null);
  const canvasRef = useRef(null);
  const progress = useRef(0);
  const world = useRef({ lo: null, hi: null });
  const liveRef = useRef(live);
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const graticule = geoGraticule10();
    const projection = geoOrthographic().clipAngle(90).precision(0.4);
    const path = geoPath(projection, ctx);
    let raf = 0;
    let visible = true;
    let size = { w: 0, h: 0, dpr: 1 };

    const measure = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w && h && (w !== size.w || h !== size.h || dpr !== size.dpr)) {
        size = { w, h, dpr };
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
    };

    const readProgress = () => {
      const rect = section.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      progress.current = total > 0 ? clamp(-rect.top / total) : 0;
      let index = 0;
      BEATS.forEach((b, i) => {
        if (progress.current >= b.at) index = i;
      });
      setBeat((prev) => (prev === index ? prev : index));
    };

    const draw = (now) => {
      measure();
      const { w, h, dpr } = size;
      if (!w) return;
      const t = reduced ? 0 : now;
      const p = progress.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const narrow = w < 720;
      const min = Math.min(w, h);
      const e = ease(clamp((p - 0.05) / 0.4)); // how far the globe has turned to Hanoi
      const z = ease(clamp((p - 0.42) / 0.4)); // how far we have zoomed in
      const r0 = narrow ? w * 0.36 : min * 0.34;
      const r1 = min * 3.4;
      const radius = r0 * (r1 / r0) ** z;
      const cx = narrow ? w / 2 : w * 0.64;
      const cy = narrow ? h * 0.36 : h * 0.5;

      const auto = 20 - (t / 1000) * 8 - p * 200;
      const lon = auto + wrap180(HANOI[0] - auto) * e;
      const lat = 16 + (HANOI[1] - 16) * e;
      const tilt = -18 * (1 - e);
      projection.rotate([-lon, -lat, tilt]).scale(radius).translate([cx, cy]);

      // Stars fade out as we fall towards the surface.
      const starAlpha = 1 - z;
      if (starAlpha > 0.01) {
        for (const s of STARS) {
          const tw = reduced ? 1 : 0.6 + 0.4 * Math.sin(t / 900 + s.tw);
          ctx.globalAlpha = s.a * tw * starAlpha;
          ctx.fillStyle = "#e9fff3";
          ctx.beginPath();
          ctx.arc(s.x * w, s.y * h, s.r, 0, 6.2832);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // An orbit ring with a small satellite: back half behind the globe, front half over it.
      const orbitAlpha = clamp(1 - z * 3);
      const orbit = (front) => {
        if (orbitAlpha <= 0.01) return;
        const a = radius * 1.62;
        const b = radius * 0.4;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.38);
        ctx.strokeStyle = `rgba(167,232,193,${0.28 * orbitAlpha})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 7]);
        ctx.beginPath();
        ctx.ellipse(0, 0, a, b, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        const theta = (t / 4200) % 6.2832;
        if (Math.sin(theta) > 0 === front) {
          ctx.fillStyle = `rgba(255,255,255,${0.95 * orbitAlpha})`;
          ctx.shadowColor = "#a7e8c1";
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(a * Math.cos(theta), b * Math.sin(theta), 3.2, 0, 6.2832);
          ctx.fill();
        }
        ctx.restore();
      };
      orbit(false);

      // Atmosphere glow
      if (radius < min * 1.6) {
        const glow = ctx.createRadialGradient(cx, cy, radius * 0.96, cx, cy, radius * 1.34);
        glow.addColorStop(0, "rgba(167,232,193,0.34)");
        glow.addColorStop(0.35, "rgba(95,190,150,0.12)");
        glow.addColorStop(1, "rgba(95,190,150,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.34, 0, 6.2832);
        ctx.fill();
      }

      // Ocean
      const ocean = ctx.createRadialGradient(cx - radius * 0.38, cy - radius * 0.4, radius * 0.08, cx, cy, radius * 1.05);
      ocean.addColorStop(0, "#2c8a86");
      ocean.addColorStop(0.55, "#10505a");
      ocean.addColorStop(1, "#06212b");
      ctx.fillStyle = ocean;
      ctx.beginPath();
      path({ type: "Sphere" });
      ctx.fill();

      ctx.beginPath();
      path(graticule);
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Switch to the detailed coastline once we are close enough to see the difference.
      const data = radius > min * 0.9 && world.current.hi ? world.current.hi : world.current.lo;
      if (data) {
        ctx.beginPath();
        path(data.land);
        const land = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
        land.addColorStop(0, "#8fdca8");
        land.addColorStop(1, "#3d9a6c");
        ctx.fillStyle = land;
        ctx.fill();

        if (data.vietnam) {
          ctx.beginPath();
          path(data.vietnam);
          ctx.fillStyle = `rgba(214,255,226,${0.35 + 0.5 * e})`;
          ctx.fill();
        }

        ctx.beginPath();
        path(data.borders);
        ctx.strokeStyle = "rgba(8,40,28,0.45)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // Light from the upper left, shadow on the far limb.
      const shade = ctx.createRadialGradient(cx - radius * 0.4, cy - radius * 0.42, radius * 0.05, cx, cy, radius * 1.08);
      shade.addColorStop(0, "rgba(255,255,255,0.16)");
      shade.addColorStop(0.5, "rgba(0,0,0,0)");
      shade.addColorStop(1, "rgba(0,8,6,0.62)");
      ctx.fillStyle = shade;
      ctx.beginPath();
      path({ type: "Sphere" });
      ctx.fill();

      if (radius < min * 1.6) {
        ctx.beginPath();
        path({ type: "Sphere" });
        ctx.strokeStyle = "rgba(167,232,193,0.5)";
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }

      orbit(true);

      // Hanoi marker
      const [mx, my] = projection(HANOI) ?? [];
      const facing = geoDistance(HANOI, [lon, lat]) < 1.45;
      if (mx != null && facing) {
        const color = statusFor(liveRef.current).color;
        const scale = 1 + 0.7 * z;
        for (let i = 0; i < 3; i += 1) {
          const phase = reduced ? 0.4 + i * 0.2 : ((t / 1800 + i / 3) % 1);
          ctx.strokeStyle = color;
          ctx.globalAlpha = (1 - phase) * 0.75;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(mx, my, (5 + 36 * phase) * scale, 0, 6.2832);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(mx, my, 5.5 * scale, 0, 6.2832);
        ctx.fill();
        ctx.stroke();

        if (e > 0.25) {
          ctx.globalAlpha = clamp((e - 0.25) / 0.4);
          ctx.font = '700 14px "Be Vietnam Pro", system-ui, sans-serif';
          const label = "Hà Nội";
          const tw = ctx.measureText(label).width;
          const lx = mx + 16 * scale;
          const ly = my - 30 * scale;
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.roundRect(lx, ly, tw + 24, 28, [14, 14, 14, 4]);
          ctx.fill();
          ctx.fillStyle = "#0b2a1f";
          ctx.textBaseline = "middle";
          ctx.fillText(label, lx + 12, ly + 14.5);
          ctx.globalAlpha = 1;
        }
      }
    };

    const loop = (now) => {
      if (visible) draw(now);
      raf = requestAnimationFrame(loop);
    };

    const onScroll = () => {
      readProgress();
      if (reduced) draw(0);
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    observer.observe(section);
    readProgress();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    if (!reduced) raf = requestAnimationFrame(loop);
    else draw(0);

    let cancelled = false;
    import("world-atlas/countries-110m.json").then((m) => {
      if (cancelled) return;
      world.current.lo = prepare(m.default);
      if (reduced) draw(0);
    });
    import("world-atlas/countries-50m.json").then((m) => {
      if (cancelled) return;
      world.current.hi = prepare(m.default);
      if (reduced) draw(0);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const current = BEATS[beat];
  const last = beat === BEATS.length - 1;
  const status = statusFor(live);

  return (
    <section className="orbit" id="orbit" ref={sectionRef}>
      <div className="orbit-pin">
        <canvas ref={canvasRef} className="orbit-canvas" aria-hidden="true" />

        <div className="orbit-copy" key={beat}>
          <span className="orbit-tag">{current.tag}</span>
          <h2>{current.title}</h2>
          <p>{current.text}</p>
          {last && (
            <div className="orbit-final">
              <div className="orbit-live">
                <i style={{ background: live == null ? "#9aa09b" : status.color }} />
                <div>
                  <small>PM2.5 tại Hoàn Kiếm, ngay bây giờ</small>
                  <strong>{live == null ? "Đang tải…" : <>{formatValue(live)} <span>µg/m³ · {status.label}</span></>}</strong>
                </div>
              </div>
              <button type="button" className="lp-cta" onClick={onStart}>
                Mở bản đồ Hà Nội
                <IconArrowRight size={20} />
              </button>
            </div>
          )}
        </div>

        <ol className="orbit-steps" aria-label="Tiến trình bay">
          {BEATS.map((b, i) => (
            <li key={b.tag} className={i === beat ? "on" : i < beat ? "done" : ""}>
              <i />
              <span>{["Trái Đất", "Đông Nam Á", "Việt Nam", "Hà Nội"][i]}</span>
            </li>
          ))}
        </ol>

        {beat === 0 && <div className="orbit-hint">Cuộn xuống để bay tới Hà Nội <span>↓</span></div>}
      </div>

      <svg className="orbit-wave" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 64C140 18 280 18 420 56S700 112 860 84 1180 8 1320 28L1440 48V120H0Z" fill="#fff" />
      </svg>
    </section>
  );
}
