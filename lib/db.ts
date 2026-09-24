import { Redis } from "@upstash/redis";
import type { Job, PageConfig, Settings } from "./types";
import { DEFAULT_SETTINGS } from "./types";

let client: Redis | null = null;

export function redis(): Redis {
  if (client) return client;
  // Tích hợp Upstash trên Vercel Marketplace có thể đặt tên biến theo kiểu KV_* hoặc UPSTASH_*
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Chưa kết nối Upstash Redis (Vercel → Storage)");
  client = new Redis({ url, token });
  return client;
}

// ---------- Jobs ----------
const JOBS_INDEX = "jobs";
const jobKey = (id: string) => `job:${id}`;

export async function saveJob(job: Job) {
  job.updatedAt = Date.now();
  await redis().set(jobKey(job.id), job);
  await redis().zadd(JOBS_INDEX, { score: job.createdAt, member: job.id });
}

export async function getJob(id: string) {
  return redis().get<Job>(jobKey(id));
}

export async function deleteJob(id: string) {
  await redis().del(jobKey(id));
  await redis().zrem(JOBS_INDEX, id);
}

/** Các job mới nhất trước. */
export async function listJobs(limit = 60): Promise<Job[]> {
  const ids = await redis().zrange<string[]>(JOBS_INDEX, 0, limit - 1, { rev: true });
  if (!ids.length) return [];
  const jobs = await redis().mget<(Job | null)[]>(...ids.map(jobKey));
  return jobs.filter((j): j is Job => Boolean(j));
}

// ---------- Pages ----------
export async function getPages(): Promise<PageConfig[]> {
  return (await redis().get<PageConfig[]>("pages")) || [];
}

export async function savePages(pages: PageConfig[]) {
  await redis().set("pages", pages);
}

// ---------- Settings ----------
export async function getSettings(): Promise<Settings> {
  const s = await redis().get<Partial<Settings>>("settings");
  return { ...DEFAULT_SETTINGS, ...s, auto: { ...DEFAULT_SETTINGS.auto, ...s?.auto } };
}

export async function saveSettings(s: Settings) {
  await redis().set("settings", s);
}

// ---------- Lịch sử ý tưởng (để không lặp lại) ----------
export async function getHistory(): Promise<string[]> {
  return redis().lrange<string>("history", 0, 199);
}

export async function addHistory(titles: string[]) {
  if (!titles.length) return;
  await redis().lpush("history", ...titles);
  await redis().ltrim("history", 0, 499);
}

// ---------- Khoá đơn giản để 2 lần "tick" không chạy chồng nhau ----------
export async function withLock<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T | null> {
  const token = crypto.randomUUID();
  const ok = await redis().set(`lock:${key}`, token, { nx: true, ex: ttlSec });
  if (!ok) return null;
  try {
    return await fn();
  } finally {
    if ((await redis().get(`lock:${key}`)) === token) await redis().del(`lock:${key}`);
  }
}
