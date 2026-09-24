import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Nạp file .env (không cần thư viện dotenv). Biến đã có trong môi trường được ưu tiên. */
export function loadEnv(file = path.join(ROOT, ".env")) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let value = m[2];
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function log(...args) {
  const t = new Date().toLocaleTimeString("vi-VN", { hour12: false });
  console.log(`[${t}]`, ...args);
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/**
 * fetch có retry khi gặp 429 / 5xx / lỗi mạng (backoff luỹ thừa).
 * Trả về Response; ném lỗi kèm nội dung body nếu status không OK.
 */
export async function fetchRetry(url, options = {}, { retries = 4, label = url } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      const body = await res.text();
      const err = new Error(`${label} -> HTTP ${res.status}: ${body.slice(0, 1000)}`);
      err.status = res.status;
      if (res.status !== 429 && res.status < 500) throw err;
      lastErr = err;
    } catch (err) {
      if (err.status && err.status !== 429 && err.status < 500) throw err;
      lastErr = err;
    }
    if (attempt < retries) {
      const wait = 2000 * 2 ** attempt;
      log(`  ! ${label} lỗi, thử lại sau ${wait / 1000}s (${lastErr.message.slice(0, 120)})`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

export async function fetchJson(url, options, retryOpts) {
  const res = await fetchRetry(url, options, retryOpts);
  return res.json();
}

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường ${name} (xem .env.example)`);
  return v;
}
