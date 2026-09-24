import { fetchJson, requireEnv } from "./util.mjs";

const SYSTEM_PROMPT = `Bạn là đạo diễn nội dung cho các Fanpage chuyên video ngắn (Reels) về chó Corgi.
Nhiệm vụ: nghĩ ra các ý tưởng cảnh quay NGẮN (8 giây), dễ viral, dễ thương, hài hước hoặc cảm động.
Mỗi ý tưởng phải có một khoảnh khắc hành động rõ ràng mà AI video có thể diễn được trong 8 giây,
bố cục dọc 9:16, chỉ 1-2 con corgi là nhân vật chính, không chữ, không logo, không watermark.
Tránh trùng lặp với danh sách ý tưởng đã dùng.`;

function userPrompt({ count, language, style, usedTitles }) {
  return `Hãy tạo ${count} ý tưởng mới. Phong cách kênh: ${style}.
Ngôn ngữ caption: ${language === "vi" ? "tiếng Việt tự nhiên, có emoji vừa phải" : language}.

Ý tưởng ĐÃ DÙNG (không lặp lại):
${usedTitles.length ? usedTitles.slice(-150).map((t) => `- ${t}`).join("\n") : "(chưa có)"}

Trả về JSON đúng dạng:
{
  "ideas": [
    {
      "title": "tên ngắn của ý tưởng",
      "image_prompt": "prompt TIẾNG ANH chi tiết để tạo ẢNH khung hình đầu tiên: corgi (màu lông, biểu cảm), bối cảnh, ánh sáng, góc máy, phong cách photorealistic, vertical 9:16 composition, no text",
      "video_prompt": "prompt TIẾNG ANH mô tả CHUYỂN ĐỘNG trong 8 giây bắt đầu từ ảnh trên: hành động của corgi, chuyển động máy quay, âm thanh (ambient, tiếng chó, nhạc nhẹ), không có lời thoại, không chữ",
      "caption": "caption đăng Facebook (1-3 câu, có hook ở câu đầu, kêu gọi tương tác)",
      "hashtags": ["#corgi", "..."]
    }
  ]
}`;
}

/** Sinh danh sách ý tưởng bằng ChatGPT (OpenAI Chat Completions, JSON mode). */
export async function generateIdeas({ count, usedTitles = [], dryRun = false }) {
  const language = process.env.CAPTION_LANGUAGE || "vi";
  const style = process.env.CHANNEL_STYLE || "Video ngắn corgi dễ thương, hài hước, đời thường";

  if (dryRun) {
    return Array.from({ length: count }, (_, i) => ({
      title: `Corgi demo ${Date.now()}-${i + 1}`,
      image_prompt: "A fluffy Pembroke Welsh Corgi puppy sitting on a sunny wooden porch, photorealistic, vertical 9:16",
      video_prompt: "The corgi tilts its head, wags its tail and trots toward the camera; gentle handheld camera; soft birdsong and paw taps",
      caption: "Ai đi làm về cũng muốn được đón thế này không? 🐶💛",
      hashtags: ["#corgi", "#cho", "#reels"],
    }));
  }

  const data = await fetchJson(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TEXT_MODEL || "gpt-5-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt({ count, language, style, usedTitles }) },
        ],
      }),
    },
    { label: "OpenAI ideas" },
  );

  const parsed = JSON.parse(data.choices[0].message.content);
  const ideas = (parsed.ideas || []).filter((i) => i.title && i.image_prompt && i.video_prompt);
  if (!ideas.length) throw new Error("ChatGPT không trả về ý tưởng hợp lệ");
  return ideas.slice(0, count);
}
