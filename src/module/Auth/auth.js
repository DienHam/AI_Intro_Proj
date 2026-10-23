// Demo-only accounts: kept in this browser's localStorage, there is no server behind them.
const SESSION_KEY = "aq.session";
const ACCOUNTS_KEY = "aq.accounts";

function read(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be blocked (private mode); the session just won't persist.
  }
}

const toHex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hashPassword(password, salt) {
  if (!globalThis.crypto?.subtle) throw new Error("Trình duyệt này không hỗ trợ mã hóa mật khẩu. Hãy mở trang qua localhost hoặc HTTPS.");
  const data = new TextEncoder().encode(`${salt}:${password}`);
  return toHex(await crypto.subtle.digest("SHA-256", data));
}

export function getSession() {
  return read(localStorage, SESSION_KEY, null) ?? read(sessionStorage, SESSION_KEY, null);
}

export function saveSession(user, remember = true) {
  clearSession();
  write(remember ? localStorage : sessionStorage, SESSION_KEY, user);
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

export async function registerAccount({ name, email, password }) {
  const accounts = read(localStorage, ACCOUNTS_KEY, {});
  const key = email.trim().toLowerCase();
  if (accounts[key]) throw new Error("Email này đã có tài khoản. Hãy đăng nhập.");
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  accounts[key] = { name: name.trim(), email: key, salt, hash: await hashPassword(password, salt) };
  write(localStorage, ACCOUNTS_KEY, accounts);
  return { name: accounts[key].name, email: key };
}

export async function loginAccount({ email, password }) {
  const accounts = read(localStorage, ACCOUNTS_KEY, {});
  const account = accounts[email.trim().toLowerCase()];
  if (!account) throw new Error("Chưa có tài khoản với email này. Hãy chuyển sang Đăng ký.");
  if ((await hashPassword(password, account.salt)) !== account.hash) throw new Error("Mật khẩu chưa đúng.");
  return { name: account.name, email: account.email };
}
