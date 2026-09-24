import { fetchJson, requireEnv } from "./http";
import type { Idea } from "./types";

const SYSTEM_PROMPT = `Bạn là đạo diễn nội dung cho các Fanpage chuyên video ngắn (Reels) về chó Corgi.
Nhiệm vụ: nghĩ ra các ý tưởng cảnh quay NGẮN (8 giây), dễ viral, dễ thương, hài hước hoặc cảm động.
Mỗi ý tưởng phải có một khoảnh khắc hành động rõ ràng mà AI video có thể diễn được trong 8 giây,
bố cục dọc 9:16, chỉ 1-2 con corgi là nhân vật chính, không chữ, không logo, không watermark.
Các ý tưởng trong cùng một lần phải khác nhau rõ rệt về bối cảnh và hành động.
Tránh trùng lặp với danh sách ý tưởng đã dùng.`;

const headers = () => ({
  Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
  "Content-Type": "application/json",
});

/** Sinh ý tưởng bằng ChatGPT (Chat Completions, JSON mode). */
export async function generateIdeas(opts: {
  count: number;
  style: string;
  language: string;
  usedTitles: string[];
}): Promise<Idea[]> {
  const { count, style, language, usedTitles } = opts;
  const user = `Hãy tạo ${count} ý tưởng mới. Phong cách kênh: ${style}.
Ngôn ngữ caption: ${language === "vi" ? "tiếng Việt tự nhiên, có emoji vừa phải" : language}.

Ý tưởng ĐÃ DÙNG (không lặp lại):
${usedTitles.length ? usedTitles.slice(0, 150).map((t) => `- ${t}`).join("\n") : "(chưa có)"}

Trả về JSON đúng dạng:
{
  "ideas": [
    {
      "title": "tên ngắn của ý tưởng",
      "image_prompt": "prompt TIẾNG ANH chi tiết để tạo ẢNH khung hình đầu tiên: corgi (màu lông, biểu cảm), bối cảnh, ánh sáng, góc máy, photorealistic, vertical 9:16 composition, no text",
      "video_prompt": "prompt TIẾNG ANH mô tả CHUYỂN ĐỘNG trong 8 giây bắt đầu từ ảnh trên: hành động của corgi, chuyển động máy quay, âm thanh (ambient, tiếng chó, nhạc nhẹ), không lời thoại, không chữ",
      "caption": "caption đăng Facebook (1-3 câu, câu đầu là hook, kêu gọi tương tác)",
      "hashtags": ["#corgi", "..."]
    }
  ]
}`;

  const data = await fetchJson(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        model: process.env.OPENAI_TEXT_MODEL || "gpt-5-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: user },
        ],
      }),
    },
    { label: "OpenAI (ý tưởng)" },
  );

  const parsed = JSON.parse(data.choices[0].message.content);
  const ideas: Idea[] = (parsed.ideas || [])
    .filter((i: Partial<Idea>) => i.title && i.image_prompt && i.video_prompt)
    .map((i: Idea) => ({ ...i, caption: i.caption || "", hashtags: i.hashtags || [] }));
  if (!ideas.length) throw new Error("ChatGPT không trả về ý tưởng hợp lệ");
  return ideas.slice(0, count);
}

/** Tạo ảnh khung hình đầu bằng OpenAI Images API (gpt-image-*). Trả về PNG. */
export async function generateImage(prompt: string): Promise<Buffer> {
  const data = await fetchJson(
    "https://api.openai.com/v1/images/generations",
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
        prompt: `${prompt}\n\nPhotorealistic, high detail, natural colors, vertical portrait framing, no text, no watermark, no logo.`,
        size: process.env.OPENAI_IMAGE_SIZE || "1024x1536",
        quality: process.env.OPENAI_IMAGE_QUALITY || "high",
        n: 1,
      }),
    },
    { label: "OpenAI (tạo ảnh)", retries: 1 },
  );
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error(`OpenAI không trả về ảnh: ${JSON.stringify(data).slice(0, 300)}`);
  return Buffer.from(b64, "base64");
}
