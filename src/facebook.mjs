import fs from "node:fs";
import { fetchJson, requireEnv } from "./util.mjs";

const graph = () => `https://graph.facebook.com/${process.env.FB_GRAPH_VERSION || "v23.0"}`;

function form(params) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) body.set(k, String(v));
  return body;
}

/**
 * Đăng video dạng Reels lên 1 Fanpage (3 bước: start -> upload -> finish).
 * scheduledAt (Date, tuỳ chọn): hẹn giờ đăng (FB yêu cầu cách hiện tại 10 phút – 75 ngày).
 */
export async function postReel({ page, videoFile, description, scheduledAt, dryRun = false }) {
  if (dryRun) return { dryRun: true, page: page.name, scheduledAt: scheduledAt?.toISOString() };

  const token = page.access_token;
  const url = `${graph()}/${page.id}/video_reels`;

  // 1. Khởi tạo phiên upload
  const start = await fetchJson(
    url,
    { method: "POST", body: form({ upload_phase: "start", access_token: token }) },
    { label: `FB start ${page.name}` },
  );

  // 2. Upload file nhị phân lên rupload
  const bytes = fs.readFileSync(videoFile);
  const upload = await fetchJson(
    start.upload_url,
    {
      method: "POST",
      headers: { Authorization: `OAuth ${token}`, offset: "0", file_size: String(bytes.length) },
      body: bytes,
    },
    { label: `FB upload ${page.name}`, retries: 2 },
  );
  if (!upload.success) throw new Error(`Upload thất bại: ${JSON.stringify(upload)}`);

  // 3. Hoàn tất & đăng / hẹn giờ
  const finish = await fetchJson(
    url,
    {
      method: "POST",
      body: form({
        upload_phase: "finish",
        video_id: start.video_id,
        video_state: scheduledAt ? "SCHEDULED" : "PUBLISHED",
        scheduled_publish_time: scheduledAt ? Math.floor(scheduledAt.getTime() / 1000) : undefined,
        description,
        access_token: token,
      }),
    },
    { label: `FB finish ${page.name}` },
  );
  if (!finish.success) throw new Error(`Finish thất bại: ${JSON.stringify(finish)}`);
  return { video_id: start.video_id, page: page.name, scheduledAt: scheduledAt?.toISOString() };
}

/** Lấy danh sách Page + Page access token từ User access token (dài hạn). */
export async function fetchPagesFromUserToken() {
  const token = requireEnv("FB_USER_ACCESS_TOKEN");
  const pages = [];
  let next = `${graph()}/me/accounts?fields=id,name,access_token,tasks&limit=100&access_token=${encodeURIComponent(token)}`;
  while (next) {
    const data = await fetchJson(next, {}, { label: "FB me/accounts" });
    for (const p of data.data || []) {
      pages.push({ id: p.id, name: p.name, access_token: p.access_token, enabled: true, tasks: p.tasks });
    }
    next = data.paging?.next;
  }
  return pages;
}
