import { useEffect, useRef, useState } from "react";
import { BANDS, formatValue, statusFor } from "../aqi";
import { IconArrowRight, IconForecast, IconHistory, IconMap, IconSpark } from "../Icons";
import Orbit from "./Orbit";
import "./Landing.css";

const FEATURES = [
  { Icon: IconMap, title: "Bản đồ và heatmap", text: "Bụi mịn PM2.5 của 12 khu vực nội thành, phủ màu liên tục lên bản đồ để thấy chỗ nào đang nặng." },
  { Icon: IconForecast, title: "Dự báo giờ tới", text: "Giờ sau tăng hay giảm so với bây giờ, từng khu vực một, kèm biểu đồ đo thực tế và dự báo." },
  { Icon: IconHistory, title: "Lịch sử 7 ngày", text: "Xem lại theo giờ, so với mức trung bình cả thành phố, và tải về CSV để tự phân tích." },
  { Icon: IconSpark, title: "Trợ lý hỏi đáp", text: "Hỏi “khu nào cao nhất”, “có nên ra ngoài không” và nhận câu trả lời từ số liệu đang hiển thị." }
];

const STEPS = [
  { n: "01", title: "Nhìn", text: "Mở bản đồ nhiệt và xem bụi mịn đang lan thế nào trên Hà Nội." },
  { n: "02", title: "Hiểu", text: "So khu vực với ngưỡng khuyến nghị của WHO và đọc xu hướng theo giờ." },
  { n: "03", title: "Hành động", text: "Hỏi trợ lý nên đeo khẩu trang hay ra đi bộ ven hồ được chưa." }
];

function Reveal({ as: Tag = "div", children, className = "", delay = 0 }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(
    () => typeof IntersectionObserver === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    if (seen || !ref.current) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [seen]);

  return (
    <Tag ref={ref} className={`reveal ${seen ? "in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

/** Organic wave that closes one section and opens the next. `fill` is the colour of the section below. */
function Wave({ fill, flip = false, className = "" }) {
  return (
    <svg
      className={`lp-wave ${flip ? "flip" : ""} ${className}`}
      viewBox="0 0 1440 120"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M0 64C140 18 280 18 420 56S700 112 860 84 1180 8 1320 28L1440 48V120H0Z" fill={fill} />
    </svg>
  );
}

function Leaf({ className }) {
  return (
    <svg className={className} viewBox="0 0 120 160" aria-hidden="true">
      <path d="M60 4C20 40 8 86 60 156 112 86 100 40 60 4Z" fill="currentColor" />
      <path d="M60 22V150M60 70 38 52M60 98 34 78M60 70 82 52M60 98 86 78" stroke="#0b2a1f" strokeOpacity=".35" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Concentric rings, like a breath or a ripple spreading out. */
function Rings({ className }) {
  return (
    <svg className={className} viewBox="0 0 600 600" fill="none" stroke="currentColor" aria-hidden="true">
      {[60, 120, 180, 240, 296].map((r, i) => (
        <circle key={r} cx="300" cy="300" r={r} strokeWidth="1.5" strokeOpacity={0.9 - i * 0.16} />
      ))}
    </svg>
  );
}

function Blob({ className }) {
  return (
    <svg className={className} viewBox="0 0 500 500" aria-hidden="true">
      <path
        d="M440 300C420 400 330 470 230 460 130 450 40 390 30 290 20 190 80 90 170 50 260 10 360 30 420 110 470 170 455 235 440 300Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function Landing({ user, onStart, onLogin }) {
  const [scrolled, setScrolled] = useState(false);
  const [live, setLive] = useState(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // One small request so the hero can show today's real number for Hoan Kiem.
  useEffect(() => {
    let cancelled = false;
    fetch("https://air-quality-api.open-meteo.com/v1/air-quality?latitude=21.0285&longitude=105.8542&current=pm2_5&timezone=Asia%2FBangkok")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((data) => {
        if (!cancelled && data?.current?.pm2_5 != null) setLive(data.current.pm2_5);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const status = statusFor(live);
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="lp">
      <header className={`lp-nav ${scrolled ? "solid" : ""}`}>
        <a className="lp-logo" href="#/" aria-label="Hanoi Air">
          <span>AQ</span>Hanoi Air
        </a>
        <nav aria-label="Điều hướng trang">
          <button type="button" onClick={() => scrollTo("about")}>Giới thiệu</button>
          <button type="button" onClick={() => scrollTo("features")}>Tính năng</button>
          <button type="button" onClick={() => scrollTo("journey")}>Hành trình</button>
        </nav>
        <button type="button" className="lp-login" onClick={onLogin}>
          {user ? "Vào dashboard" : "Đăng nhập"}
        </button>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-bg" style={{ backgroundImage: "url(/images/hero-skyline.jpg)" }} />
        <div className="lp-hero-shade" />
        <div className="lp-hero-content">
          <span className="lp-eyebrow"><i />Hà Nội · Không khí · Từng giờ</span>
          <h1>
            Hà Nội thở thế nào <em>hôm nay?</em>
          </h1>
          <p>
            PM2.5 từng giờ ở 12 khu vực, bản đồ nhiệt bụi mịn và một trợ lý để hỏi trước khi bạn bước ra đường.
          </p>
          <div className="lp-actions">
            <button type="button" className="lp-cta" onClick={onStart}>
              Bắt đầu hành trình khám phá xanh
              <IconArrowRight size={20} />
            </button>
            <button type="button" className="lp-ghost" onClick={() => scrollTo("about")}>Tìm hiểu thêm</button>
          </div>
        </div>

        <div className="lp-live" aria-live="polite">
          <span className="lp-live-dot" style={{ background: live == null ? "#9aa09b" : status.color }} />
          <div>
            <small>Hoàn Kiếm, ngay bây giờ</small>
            <strong>
              {live == null ? "Đang tải…" : <>{formatValue(live)} <span>µg/m³</span> · {status.label}</>}
            </strong>
          </div>
        </div>

        <Wave fill="#050f0b" />
      </section>

      <Orbit live={live} onStart={onStart} />

      <section className="lp-section lp-about" id="about">
        <Reveal className="lp-about-text">
          <span className="lp-kicker">Về dự án</span>
          <h2>Một câu hỏi nhỏ: giờ tới không khí sẽ ra sao?</h2>
          <p>
            Đồ án dự báo nồng độ PM2.5 ở giờ tiếp theo tại Hà Nội từ số đo theo giờ. Kết quả dùng để cảnh báo ngắn hạn, không thay thế trạm quan trắc.
          </p>
          <p>Dữ liệu hiện lấy từ Open-Meteo cho 12 khu vực nội thành và làm mới mỗi 30 phút.</p>
          <dl className="lp-facts">
            <div><dt>12</dt><dd>khu vực</dd></div>
            <div><dt>7</dt><dd>ngày lịch sử</dd></div>
            <div><dt>+1h</dt><dd>dự báo</dd></div>
          </dl>
        </Reveal>

        <Reveal className="lp-about-photo" delay={120}>
          <Blob className="lp-shape blob" />
          <span className="lp-shape sun" />
          <Leaf className="lp-shape leaf" />
          <div className="lp-collage">
            <figure className="lp-tile arch">
              <img src="/images/hoan-kiem.jpg" alt="Lối đi ven hồ Hoàn Kiếm dưới tán cây xanh" loading="lazy" />
              <figcaption>Hồ Hoàn Kiếm</figcaption>
            </figure>
            <figure className="lp-tile leafy">
              <img src="/images/one-pillar.jpg" alt="Chùa Một Cột giữa tán cây" loading="lazy" />
              <figcaption>Chùa Một Cột</figcaption>
            </figure>
            <figure className="lp-tile street">
              <img src="/images/flower-market.jpg" alt="Quầy hoa trên phố cổ Hà Nội" loading="lazy" />
              <figcaption>Phố cổ</figcaption>
            </figure>
          </div>
          <div className="lp-photo-card">
            <span>Ngưỡng PM2.5 trên bản đồ</span>
            <strong>Dưới 25 µg/m³ là mức tốt</strong>
            <div className="lp-bands">
              {BANDS.map((b) => <i key={b.className} style={{ background: b.color }} title={`${b.label} ${b.range}`} />)}
            </div>
          </div>
        </Reveal>
      </section>

      <section className="lp-features" id="features">
        <Wave fill="#fff" flip className="top" />
        <div className="lp-section lp-inner">
          <Reveal>
            <span className="lp-kicker">Bạn sẽ khám phá</span>
            <h2>Mọi thứ về bụi mịn Hà Nội, trong một chỗ</h2>
          </Reveal>
          <div className="lp-grid">
            {FEATURES.map(({ Icon, title, text }, i) => (
              <Reveal key={title} className={`lp-card tone-${i + 1}`} delay={i * 80}>
                <span className={`lp-icon s-${i + 1}`}><Icon size={22} /></span>
                <small className="lp-card-no">0{i + 1}</small>
                <h3>{title}</h3>
                <p>{text}</p>
              </Reveal>
            ))}
          </div>

          <Reveal className="lp-wide">
            <img src="/images/long-bien.jpg" alt="Cầu Long Biên, Hà Nội" loading="lazy" />
            <div className="lp-wide-shade" />
            <div className="lp-wide-text">
              <h3>Số liệu rõ nguồn, nói đúng giới hạn</h3>
              <p>Dự báo hiện lấy từ Open-Meteo, chưa phải mô hình tự huấn luyện của dự án. Điều đó được ghi rõ ngay trong giao diện.</p>
            </div>
          </Reveal>
        </div>
        <Wave fill="#fff" />
      </section>

      <section className="lp-section lp-journey" id="journey">
        <span className="lp-dots" aria-hidden="true" />
        <Reveal>
          <span className="lp-kicker">Hành trình xanh</span>
          <h2>Ba chặng, chưa đến một phút</h2>
        </Reveal>
        <ol className="lp-steps">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} className={`lp-step step-${i + 1}`} delay={i * 100}>
              <span className="lp-step-no">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      <section className="lp-final">
        <Wave fill="#fff" flip className="top" />
        <Rings className="lp-rings" />
        <Leaf className="lp-leaf one" />
        <Leaf className="lp-leaf two" />
        <Leaf className="lp-leaf three" />
        <Reveal className="lp-final-inner">
          <h2>Sẵn sàng hít thở hiểu biết hơn?</h2>
          <p>Vào dashboard và xem Hà Nội đang thở thế nào ngay bây giờ.</p>
          <button type="button" className="lp-cta" onClick={onStart}>
            Bắt đầu hành trình khám phá xanh
            <IconArrowRight size={20} />
          </button>
        </Reveal>
      </section>

      <footer className="lp-footer">
        <div>
          <strong>Hanoi Air · Air Quality Prediction 2026</strong>
          <p>Dữ liệu: Open-Meteo Air Quality API. Bản đồ: OpenStreetMap contributors.</p>
        </div>
        <p>
          Ảnh từ Wikimedia Commons (CC0): Hanoi skyline with Ba Vi Mountain, Hoan Kiem Lake (DSC03685), Long Bien Bridge, One Pillar Pagoda (DSC03500), Flower market (DSC03681).
        </p>
      </footer>
    </div>
  );
}
