import { useEffect, useRef, useState } from "react";
import { IconSend, IconSpark } from "../Icons";
import { ADVICE, statusFor } from "../aqi";
import "./Chat.css";

const SUGGESTIONS = [
  "Khu vực nào đang cao nhất?",
  "PM2.5 trung bình Hà Nội?",
  "Dự báo giờ tới",
  "Có nên ra ngoài không?"
];

const normalize = (text) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");

const fmt = (value) => (value == null || !Number.isFinite(Number(value)) ? null : Number(value).toFixed(1));

const hasAny = (text, words) => words.some((word) => text.includes(word));

// Rule-based answers built from the data on screen. Swap this function for an LLM call to go further.
function reply(question, { stations, selected }) {
  const q = normalize(question);
  const withData = stations.filter((s) => fmt(s.pm25) != null);
  const named = stations.find((s) => q.includes(normalize(s.name)));
  const target = named ?? selected;

  const wantsForecast = hasAny(q, ["du bao", "gio toi", "gio sau", "tiep theo", "sap toi", "forecast"]);
  const needsData = named || wantsForecast || hasAny(q, ["cao nhat", "te nhat", "sach nhat", "thap nhat", "trung binh", "ra ngoai", "khau trang", "suc khoe", "tap the duc", "hien tai", "bay gio", "bao nhieu"]);

  if (needsData && !withData.length) {
    return "Mình chưa nhận được dữ liệu trực tiếp. Bạn thử tải lại trang hoặc kiểm tra kết nối mạng nhé.";
  }

  if (wantsForecast) {
    const now = fmt(target?.pm25);
    const next = fmt(target?.nextHourPM25);
    if (now == null || next == null) return `Chưa có số liệu dự báo cho ${target?.name ?? "khu vực này"}.`;
    const diff = Number(next) - Number(now);
    const trend = Math.abs(diff) < 0.5 ? "gần như không đổi" : diff > 0 ? `tăng ${diff.toFixed(1)}` : `giảm ${Math.abs(diff).toFixed(1)}`;
    return `Giờ tới tại ${target.name}, PM2.5 dự kiến khoảng ${next} µg/m³ (${trend} so với hiện tại ${now}).\nSố liệu dự báo lấy từ Open-Meteo.`;
  }

  if (hasAny(q, ["cao nhat", "te nhat", "o nhiem nhat", "nhieu bui nhat", "highest"])) {
    const top = [...withData].sort((a, b) => b.pm25 - a.pm25)[0];
    return `${top.name} đang cao nhất với PM2.5 ${fmt(top.pm25)} µg/m³ (${statusFor(top.pm25).label}).`;
  }

  if (hasAny(q, ["sach nhat", "tot nhat", "thap nhat", "it bui nhat", "lowest"])) {
    const low = [...withData].sort((a, b) => a.pm25 - b.pm25)[0];
    return `${low.name} đang thấp nhất với PM2.5 ${fmt(low.pm25)} µg/m³ (${statusFor(low.pm25).label}).`;
  }

  if (hasAny(q, ["trung binh", "average", "ca ha noi", "toan thanh pho"])) {
    const avg = withData.reduce((sum, s) => sum + Number(s.pm25), 0) / withData.length;
    return `PM2.5 trung bình của ${withData.length} khu vực là ${avg.toFixed(1)} µg/m³ (${statusFor(avg).label}).`;
  }

  if (hasAny(q, ["ra ngoai", "khau trang", "suc khoe", "tap the duc", "chay bo", "nen "])) {
    const value = fmt(target?.pm25);
    if (value == null) return ADVICE.unknown;
    return `Tại ${target.name}, PM2.5 đang là ${value} µg/m³ (${statusFor(target.pm25).label}).\n${ADVICE[statusFor(target.pm25).className]}`;
  }

  if (named) {
    const value = fmt(named.pm25);
    if (value == null) return `Chưa có số liệu cho ${named.name}.`;
    return `${named.name}: PM2.5 ${value} µg/m³ (${statusFor(named.pm25).label}), PM10 ${fmt(named.pm10) ?? "--"} µg/m³.`;
  }

  if (hasAny(q, ["pm2.5", "pm25", "la gi", "bui min"])) {
    return "PM2.5 là các hạt bụi có đường kính dưới 2,5 micromet, nhỏ đến mức đi sâu vào phổi và máu. Đơn vị đo là µg/m³. Trên bản đồ này: dưới 25 là tốt, 25–49 trung bình, 50–99 cao, từ 100 là rất cao.";
  }

  if (hasAny(q, ["xin chao", "chao", "hello", "hi "]) || q.trim() === "hi") {
    return "Chào bạn! Bạn muốn xem khu vực nào, hay hỏi về mức cao nhất, trung bình, dự báo giờ tới?";
  }

  if (hasAny(q, ["cam on", "thanks"])) return "Không có gì! Cần xem thêm gì cứ hỏi mình nhé.";

  return "Mình chưa hiểu câu này. Bạn có thể hỏi về một khu vực (ví dụ “Cầu Giấy”), mức cao nhất/thấp nhất, trung bình, dự báo giờ tới hoặc lời khuyên khi ra ngoài.";
}

export default function Chat({ stations, selected }) {
  const [messages, setMessages] = useState([
    {
      id: 0,
      from: "bot",
      text: "Xin chào! Mình trả lời về chất lượng không khí 12 khu vực Hà Nội dựa trên số liệu đang hiển thị. Thử một gợi ý bên dưới nhé."
    }
  ]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef(null);
  const timerRef = useRef(null);
  const nextId = useRef(1);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, typing]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  function send(text) {
    const question = text.trim();
    if (!question || typing) return;
    setMessages((list) => [...list, { id: nextId.current++, from: "user", text: question }]);
    setDraft("");
    setTyping(true);
    timerRef.current = setTimeout(() => {
      setMessages((list) => [...list, { id: nextId.current++, from: "bot", text: reply(question, { stations, selected }) }]);
      setTyping(false);
    }, 550);
  }

  return (
    <section className="chat" aria-label="Air quality assistant">
      <header className="chat-head">
        <span className="chat-avatar"><IconSpark size={18} /></span>
        <div>
          <h2>Hanoi Air Assistant</h2>
          <p>Trả lời từ số liệu đang hiển thị</p>
        </div>
      </header>

      <div className="chat-log" role="log" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.from}`}>{m.text}</div>
        ))}
        {typing && (
          <div className="bubble bot typing" aria-label="Đang trả lời">
            <i /><i /><i />
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="chat-suggest">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" onClick={() => send(s)}>{s}</button>
        ))}
      </div>

      <form
        className="chat-input"
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Hỏi về chất lượng không khí…"
          aria-label="Câu hỏi"
        />
        <button type="submit" disabled={!draft.trim() || typing} aria-label="Gửi">
          <IconSend size={18} />
        </button>
      </form>
    </section>
  );
}
