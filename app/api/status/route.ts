import { handle } from "@/lib/api";

/** Cho giao diện biết biến môi trường nào còn thiếu. */
export const GET = handle(async () => {
  const env = process.env;
  return {
    checks: [
      { name: "OPENAI_API_KEY", ok: Boolean(env.OPENAI_API_KEY), hint: "Key ChatGPT để tạo ý tưởng + ảnh" },
      { name: "GEMINI_API_KEY", ok: Boolean(env.GEMINI_API_KEY), hint: "Key Gemini để tạo video Veo 3" },
      {
        name: "Upstash Redis",
        ok: Boolean(env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL),
        hint: "Vercel → Storage → thêm Upstash Redis",
      },
      { name: "Vercel Blob", ok: Boolean(env.BLOB_READ_WRITE_TOKEN), hint: "Vercel → Storage → tạo Blob (Public)" },
      { name: "CRON_SECRET", ok: Boolean(env.CRON_SECRET), hint: "Chuỗi bí mật bất kỳ để bảo vệ /api/cron" },
      { name: "FB_APP_ID / FB_APP_SECRET", ok: Boolean(env.FB_APP_ID && env.FB_APP_SECRET), hint: "Không bắt buộc: giúp Page token không hết hạn", optional: true },
    ],
  };
});
