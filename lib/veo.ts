import { fetchJson, fetchRetry, requireEnv } from "./http";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export class NonRetryableError extends Error {}

/** Gửi yêu cầu tạo video từ ảnh cho Veo 3 (Gemini API). Trả về tên operation để kiểm tra sau. */
export async function startVeo(prompt: string, image: Buffer): Promise<string> {
  const model = process.env.VEO_MODEL || "veo-3.1-fast-generate-preview";
  const parameters: Record<string, unknown> = {
    aspectRatio: process.env.VEO_ASPECT_RATIO || "9:16",
    negativePrompt: "text, subtitles, watermark, logo, distorted anatomy, extra legs, extra tails, blurry, low quality",
  };
  if (process.env.VEO_RESOLUTION) parameters.resolution = process.env.VEO_RESOLUTION;
  if (process.env.VEO_DURATION_SECONDS) parameters.durationSeconds = Number(process.env.VEO_DURATION_SECONDS);

  const op = await fetchJson(
    `${BASE}/models/${model}:predictLongRunning`,
    {
      method: "POST",
      headers: { "x-goog-api-key": requireEnv("GEMINI_API_KEY"), "Content-Type": "application/json" },
      body: JSON.stringify({
        // Gemini API cho Veo nhận ảnh dạng bytesBase64Encoded (inlineData sẽ bị lỗi 400)
        instances: [{ prompt, image: { bytesBase64Encoded: image.toString("base64"), mimeType: "image/png" } }],
        parameters,
      }),
    },
    { label: `Veo (${model})`, retries: 1 },
  );
  if (!op.name) throw new Error(`Veo không trả operation: ${JSON.stringify(op).slice(0, 300)}`);
  return op.name;
}

/** Kiểm tra operation. Trả về null nếu chưa xong, hoặc file MP4 khi đã xong. */
export async function checkVeo(operation: string): Promise<Buffer | null> {
  const apiKey = requireEnv("GEMINI_API_KEY");
  const status = await fetchJson(`${BASE}/${operation}`, { headers: { "x-goog-api-key": apiKey } }, { label: "Veo (kiểm tra)" });
  if (!status.done) return null;
  if (status.error) throw new NonRetryableError(`Veo lỗi: ${JSON.stringify(status.error)}`);

  const resp = status.response?.generateVideoResponse;
  const uri: string | undefined = resp?.generatedSamples?.[0]?.video?.uri;
  if (!uri) {
    const reasons = resp?.raiMediaFilteredReasons?.join("; ");
    throw new NonRetryableError(
      `Veo không trả video${reasons ? ` (bị bộ lọc an toàn chặn: ${reasons})` : ""}: ${JSON.stringify(status).slice(0, 300)}`,
    );
  }
  const res = await fetchRetry(uri, { headers: { "x-goog-api-key": apiKey } }, { label: "Veo (tải video)" });
  return Buffer.from(await res.arrayBuffer());
}
