export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch có retry khi gặp 429 / 5xx / lỗi mạng (backoff luỹ thừa). */
export async function fetchRetry(
  url: string,
  init: RequestInit = {},
  { retries = 2, label = url }: { retries?: number; label?: string } = {},
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...init, cache: "no-store" });
      if (res.ok) return res;
      const body = await res.text();
      const err = new HttpError(`${label} → HTTP ${res.status}: ${body.slice(0, 800)}`, res.status);
      if (res.status !== 429 && res.status < 500) throw err;
      lastErr = err;
    } catch (err) {
      if (err instanceof HttpError && err.status !== 429 && err.status < 500) throw err;
      lastErr = err;
    }
    if (attempt < retries) await sleep(2000 * 2 ** attempt);
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${label} thất bại`);
}

export async function fetchJson<T = any>(
  url: string,
  init?: RequestInit,
  opts?: { retries?: number; label?: string },
): Promise<T> {
  const res = await fetchRetry(url, init, opts);
  return res.json() as Promise<T>;
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Chưa cấu hình biến môi trường ${name} trên Vercel`);
  return v;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
