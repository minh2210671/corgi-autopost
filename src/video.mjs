import fs from "node:fs";
import { fetchJson, fetchRetry, log, requireEnv, sleep } from "./util.mjs";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Tạo video từ ảnh bằng Veo 3 (Gemini API, predictLongRunning) rồi tải MP4 về.
 * Veo 3 có sinh cả âm thanh nên video_prompt nên mô tả âm thanh.
 */
export async function generateVideo({ prompt, imageFile, outFile, dryRun = false }) {
  if (dryRun) {
    fs.writeFileSync(outFile, Buffer.alloc(0));
    return outFile;
  }

  const apiKey = requireEnv("GEMINI_API_KEY");
  const model = process.env.VEO_MODEL || "veo-3.1-fast-generate-preview";
  const headers = { "x-goog-api-key": apiKey, "Content-Type": "application/json" };

  const parameters = {
    aspectRatio: process.env.VEO_ASPECT_RATIO || "9:16",
    negativePrompt: "text, subtitles, watermark, logo, distorted anatomy, extra legs, extra tails, blurry, low quality",
  };
  if (process.env.VEO_RESOLUTION) parameters.resolution = process.env.VEO_RESOLUTION;
  if (process.env.VEO_DURATION_SECONDS) parameters.durationSeconds = Number(process.env.VEO_DURATION_SECONDS);

  const op = await fetchJson(
    `${BASE}/models/${model}:predictLongRunning`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        instances: [
          {
            prompt,
            // Gemini API cho Veo nhận ảnh dạng bytesBase64Encoded (inlineData sẽ bị lỗi 400)
            image: { bytesBase64Encoded: fs.readFileSync(imageFile).toString("base64"), mimeType: "image/png" },
          },
        ],
        parameters,
      }),
    },
    { label: `Veo ${model}`, retries: 3 },
  );

  log(`  … Veo đang render (${op.name})`);
  const timeoutAt = Date.now() + 15 * 60 * 1000;
  let status = op;
  while (!status.done) {
    if (Date.now() > timeoutAt) throw new Error(`Veo quá thời gian chờ: ${op.name}`);
    await sleep(10_000);
    status = await fetchJson(`${BASE}/${op.name}`, { headers }, { label: "Veo poll" });
  }

  if (status.error) throw new Error(`Veo lỗi: ${JSON.stringify(status.error)}`);
  const resp = status.response?.generateVideoResponse;
  const uri = resp?.generatedSamples?.[0]?.video?.uri;
  if (!uri) {
    const reasons = resp?.raiMediaFilteredReasons?.join("; ");
    throw new Error(`Veo không trả video${reasons ? ` (bị lọc: ${reasons})` : ""}: ${JSON.stringify(status).slice(0, 400)}`);
  }

  const res = await fetchRetry(uri, { headers: { "x-goog-api-key": apiKey } }, { label: "Veo download" });
  fs.writeFileSync(outFile, Buffer.from(await res.arrayBuffer()));
  return outFile;
}
