import fs from "node:fs";
import { fetchJson, requireEnv } from "./util.mjs";

// PNG 1x1 dùng cho chế độ --dry-run
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** Tạo ảnh khung hình đầu bằng OpenAI Images API (gpt-image-*) và lưu ra file PNG. */
export async function generateImage({ prompt, outFile, dryRun = false }) {
  if (dryRun) {
    fs.writeFileSync(outFile, PLACEHOLDER_PNG);
    return outFile;
  }

  const data = await fetchJson(
    "https://api.openai.com/v1/images/generations",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
        prompt: `${prompt}\n\nPhotorealistic, high detail, natural colors, vertical portrait framing, no text, no watermark, no logo.`,
        size: process.env.OPENAI_IMAGE_SIZE || "1024x1536",
        quality: process.env.OPENAI_IMAGE_QUALITY || "high",
        n: 1,
      }),
    },
    { label: "OpenAI image", retries: 3 },
  );

  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error(`OpenAI không trả về ảnh: ${JSON.stringify(data).slice(0, 300)}`);
  fs.writeFileSync(outFile, Buffer.from(b64, "base64"));
  return outFile;
}
