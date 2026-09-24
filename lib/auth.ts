export const SESSION_COOKIE = "corgi_session";

/** Giá trị cookie đăng nhập = SHA-256(mật khẩu + muối). Đổi APP_PASSWORD là mọi phiên cũ mất hiệu lực. */
export async function sessionValue(password = process.env.APP_PASSWORD || ""): Promise<string> {
  const data = new TextEncoder().encode(`corgi-autopost:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cho phép gọi cron bằng header của Vercel Cron hoặc ?secret=... (dùng cho dịch vụ cron ngoài). */
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("secret") === secret;
}
