import { fetchJson } from "./http";
import type { PageConfig } from "./types";

const version = () => process.env.FB_GRAPH_VERSION || "v23.0";
const graph = () => `https://graph.facebook.com/${version()}`;

function form(params: Record<string, string | number | undefined>) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.set(k, String(v));
  return body;
}

/** FB chỉ cho hẹn giờ từ 10 phút tới 75 ngày; nếu quá gần thì đăng ngay. */
export function effectiveSchedule(scheduleAt?: number): number | undefined {
  if (!scheduleAt) return undefined;
  return scheduleAt > Date.now() + 12 * 60_000 ? scheduleAt : undefined;
}

/**
 * Đăng Reels lên 1 Fanpage từ URL video công khai (Facebook tự tải về).
 * Quy trình 3 bước: start → upload (file_url) → finish.
 */
export async function postReel(opts: {
  page: PageConfig;
  videoUrl: string;
  description: string;
  scheduleAt?: number;
}): Promise<{ videoId: string; scheduledAt?: number }> {
  const { page, videoUrl, description } = opts;
  const scheduleAt = effectiveSchedule(opts.scheduleAt);
  const token = page.access_token;
  const url = `${graph()}/${page.id}/video_reels`;

  const start = await fetchJson(url, { method: "POST", body: form({ upload_phase: "start", access_token: token }) }, { label: `FB start (${page.name})` });

  const upload = await fetchJson(
    `https://rupload.facebook.com/video-upload/${version()}/${start.video_id}`,
    { method: "POST", headers: { Authorization: `OAuth ${token}`, file_url: videoUrl } },
    { label: `FB upload (${page.name})` },
  );
  if (!upload.success) throw new Error(`Upload thất bại: ${JSON.stringify(upload)}`);

  const finish = await fetchJson(
    url,
    {
      method: "POST",
      body: form({
        upload_phase: "finish",
        video_id: start.video_id,
        video_state: scheduleAt ? "SCHEDULED" : "PUBLISHED",
        scheduled_publish_time: scheduleAt ? Math.floor(scheduleAt / 1000) : undefined,
        description,
        access_token: token,
      }),
    },
    { label: `FB finish (${page.name})` },
  );
  if (!finish.success) throw new Error(`Finish thất bại: ${JSON.stringify(finish)}`);
  return { videoId: start.video_id, scheduledAt: scheduleAt };
}

/** Lấy danh sách Page + Page token từ User token. */
export async function fetchPages(userToken: string): Promise<Omit<PageConfig, "enabled">[]> {
  const pages: Omit<PageConfig, "enabled">[] = [];
  let next: string | undefined =
    `${graph()}/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(userToken)}`;
  while (next) {
    const data: any = await fetchJson(next, {}, { label: "FB me/accounts" });
    for (const p of data.data || []) pages.push({ id: p.id, name: p.name, access_token: p.access_token });
    next = data.paging?.next;
  }
  return pages;
}

/** Đổi user token ngắn hạn sang dài hạn (cần FB_APP_ID + FB_APP_SECRET). Page token lấy từ token dài hạn sẽ không hết hạn. */
export async function exchangeLongLivedToken(userToken: string): Promise<string> {
  const appId = process.env.FB_APP_ID;
  const secret = process.env.FB_APP_SECRET;
  if (!appId || !secret) return userToken;
  const q = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: secret,
    fb_exchange_token: userToken,
  });
  const data = await fetchJson(`${graph()}/oauth/access_token?${q}`, {}, { label: "FB đổi token dài hạn" });
  return data.access_token || userToken;
}
