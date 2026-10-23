import { useState } from "react";
import { loginAccount, registerAccount } from "./auth";
import { IconArrowRight } from "../Icons";
import "./Auth.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login({ onSuccess, onGuest, onBack }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  function switchMode(next) {
    setMode(next);
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    if (isRegister && !form.name.trim()) return setError("Bạn nhập tên hiển thị nhé.");
    if (!EMAIL_RE.test(form.email.trim())) return setError("Email chưa đúng định dạng.");
    if (form.password.length < 6) return setError("Mật khẩu cần ít nhất 6 ký tự.");

    setBusy(true);
    setError("");
    try {
      const user = isRegister ? await registerAccount(form) : await loginAccount(form);
      onSuccess(user, remember);
    } catch (err) {
      setError(err.message || "Có lỗi xảy ra, thử lại nhé.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <aside className="auth-visual" style={{ backgroundImage: "url(/images/hoan-kiem.jpg)" }}>
        <div className="auth-visual-shade" />
        <button type="button" className="auth-back light" onClick={onBack}>← Trang giới thiệu</button>
        <blockquote>
          <p>Hít thở xanh hơn,<br /><em>bắt đầu từ việc biết mình đang thở gì.</em></p>
          <footer>Hồ Hoàn Kiếm, Hà Nội</footer>
        </blockquote>
      </aside>

      <section className="auth-panel">
        <button type="button" className="auth-back dark" onClick={onBack}>← Trang giới thiệu</button>

        <div className="auth-card">
          <div className="auth-logo">AQ</div>
          <h1>{isRegister ? "Tạo tài khoản" : "Chào mừng trở lại"}</h1>
          <p className="auth-sub">
            {isRegister ? "Đăng ký để lưu lựa chọn của bạn trên trình duyệt này." : "Đăng nhập để vào bảng theo dõi không khí Hà Nội."}
          </p>

          <div className="auth-tabs" role="tablist" aria-label="Chế độ">
            <button type="button" role="tab" aria-selected={!isRegister} className={!isRegister ? "on" : ""} onClick={() => switchMode("login")}>Đăng nhập</button>
            <button type="button" role="tab" aria-selected={isRegister} className={isRegister ? "on" : ""} onClick={() => switchMode("register")}>Đăng ký</button>
          </div>

          <form onSubmit={submit} noValidate>
            {isRegister && (
              <label className="field">
                <span>Tên hiển thị</span>
                <input value={form.name} onChange={set("name")} autoComplete="name" placeholder="Nguyễn Văn A" />
              </label>
            )}
            <label className="field">
              <span>Email</span>
              <input type="email" value={form.email} onChange={set("email")} autoComplete="email" placeholder="ban@example.com" />
            </label>
            <label className="field">
              <span>Mật khẩu</span>
              <div className="password">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={set("password")}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  placeholder="Ít nhất 6 ký tự"
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword}>
                  {showPassword ? "Ẩn" : "Hiện"}
                </button>
              </div>
            </label>

            <label className="check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Ghi nhớ đăng nhập
            </label>

            {error && <div className="auth-error" role="alert">{error}</div>}

            <button type="submit" className="auth-submit" disabled={busy}>
              {busy ? "Đang xử lý…" : isRegister ? "Tạo tài khoản" : "Đăng nhập"}
              {!busy && <IconArrowRight size={18} />}
            </button>
          </form>

          <div className="auth-or"><span>hoặc</span></div>
          <button type="button" className="auth-guest" onClick={onGuest}>Xem thử với tư cách khách</button>

          <p className="auth-note">
            Bản demo: chưa có máy chủ xác thực. Tài khoản chỉ lưu trên trình duyệt này, mật khẩu được băm trước khi lưu.
          </p>
        </div>
      </section>
    </main>
  );
}
