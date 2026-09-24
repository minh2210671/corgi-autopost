import { addHistory, getHistory, getJob, getPages, getSettings, listJobs, redis, saveJob, withLock } from "./db";
import { postReel } from "./facebook";
import { errMsg } from "./http";
import { generateIdeas, generateImage } from "./openai";
import { saveFile } from "./storage";
import type { Job, PageConfig } from "./types";
import { NonRetryableError, checkVeo, startVeo } from "./veo";

const MAX_ATTEMPTS = 3;
const maxParallelRenders = () => Number(process.env.MAX_PARALLEL_RENDERS) || 3;

// ---------- Giờ Việt Nam (UTC+7, không đổi giờ) ----------
const VN_OFFSET = 7 * 3600_000;
export const vnNow = () => new Date(Date.now() + VN_OFFSET);
export const vnDateKey = () => vnNow().toISOString().slice(0, 10);
/** Thời điểm (ms) của giờ "HH:MM" hôm nay theo giờ VN, cộng thêm `dayOffset` ngày. */
export function vnTimeToday(hhmm: string, dayOffset = 0): number {
  const [h, m] = hhmm.split(":").map(Number);
  const d = vnNow();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + dayOffset, h, m || 0) - VN_OFFSET;
}

export const buildCaption = (job: Job) =>
  [job.idea.caption, (job.idea.hashtags || []).join(" ")].filter(Boolean).join("\n\n");

// ---------- Tạo đợt ----------
export interface BatchInput {
  mode: "distribute" | "same";
  /** distribute: số video cho mỗi Page. same: tổng số video. */
  perPage: number;
  pageIds?: string[];
  autoPost: boolean;
  /** Trả về thời điểm hẹn đăng cho bài thứ n của 1 Page (undefined = đăng ngay khi xong) */
  slot?: (n: number) => number | undefined;
  style?: string;
}

export async function createBatch(input: BatchInput): Promise<Job[]> {
  const settings = await getSettings();
  let pages = (await getPages()).filter((p) => p.enabled);
  if (input.pageIds?.length) pages = pages.filter((p) => input.pageIds!.includes(p.id));
  if (!pages.length) throw new Error("Chưa có Fanpage nào được bật. Vào tab Fanpage để kết nối.");

  const count = input.mode === "distribute" ? input.perPage * pages.length : input.perPage;
  if (count < 1 || count > 50) throw new Error("Số video mỗi đợt phải từ 1 đến 50");

  const ideas = await generateIdeas({
    count,
    style: input.style?.trim() || settings.channelStyle,
    language: settings.captionLanguage,
    usedTitles: await getHistory(),
  });
  await addHistory(ideas.map((i) => i.title));

  const batchId = `b${Date.now().toString(36)}`;
  const perPageCounter = new Map<string, number>();
  const nextSlot = (pageId: string) => {
    const n = perPageCounter.get(pageId) || 0;
    perPageCounter.set(pageId, n + 1);
    return input.slot?.(n);
  };

  const jobs: Job[] = ideas.map((idea, i) => {
    const targetPages = input.mode === "same" ? pages : [pages[i % pages.length]];
    return {
      id: `${batchId}-${i + 1}`,
      batchId,
      createdAt: Date.now() + i, // giữ thứ tự
      updatedAt: Date.now(),
      status: "queued",
      idea,
      targets: targetPages.map((p) => ({ pageId: p.id, scheduleAt: nextSlot(p.id) })),
      autoPost: input.autoPost,
      posts: [],
      attempts: 0,
    };
  });
  for (const job of jobs) await saveJob(job);
  return jobs;
}

// ---------- Các bước xử lý 1 job ----------
async function fail(job: Job, err: unknown) {
  job.attempts++;
  job.error = errMsg(err);
  if (err instanceof NonRetryableError || job.attempts >= MAX_ATTEMPTS) job.status = "failed";
  await saveJob(job);
}

/** queued → rendering: tạo ảnh (nếu chưa có) rồi gửi cho Veo. */
async function startJob(job: Job) {
  try {
    if (!job.imageUrl) {
      const png = await generateImage(job.idea.image_prompt);
      job.imageUrl = await saveFile(`jobs/${job.id}/image.png`, png, "image/png");
      await saveJob(job);
    }
    const png = Buffer.from(await (await fetch(job.imageUrl)).arrayBuffer());
    job.veoOperation = await startVeo(job.idea.video_prompt, png);
    job.status = "rendering";
    job.error = undefined;
    await saveJob(job);
  } catch (err) {
    await fail(job, err);
  }
}

/** rendering → ready: kiểm tra Veo, xong thì lưu video. */
async function pollJob(job: Job) {
  try {
    const mp4 = await checkVeo(job.veoOperation!);
    if (!mp4) return;
    job.videoUrl = await saveFile(`jobs/${job.id}/video.mp4`, mp4, "video/mp4");
    job.status = "ready";
    job.error = undefined;
    await saveJob(job);
  } catch (err) {
    if (!(err instanceof NonRetryableError)) return fail(job, err);
    // Veo từ chối/lỗi: cho render lại từ đầu (ảnh giữ nguyên) nếu còn lượt
    job.veoOperation = undefined;
    job.status = "queued";
    await fail(job, new Error(errMsg(err)));
  }
}

/** Đăng video lên các Page đích (bỏ qua Page đã đăng thành công). */
export async function postJob(job: Job, allPages?: PageConfig[]) {
  if (!job.videoUrl) throw new Error("Video chưa sẵn sàng");
  const pages = allPages || (await getPages());
  for (const target of job.targets) {
    if (job.posts.some((p) => p.pageId === target.pageId && p.ok)) continue;
    const page = pages.find((p) => p.id === target.pageId);
    job.posts = job.posts.filter((p) => p.pageId !== target.pageId); // bỏ kết quả lỗi cũ
    if (!page) {
      job.posts.push({ pageId: target.pageId, pageName: target.pageId, ok: false, at: Date.now(), error: "Page không còn trong danh sách" });
      continue;
    }
    try {
      const r = await postReel({ page, videoUrl: job.videoUrl, description: buildCaption(job), scheduleAt: target.scheduleAt });
      job.posts.push({ pageId: page.id, pageName: page.name, ok: true, at: Date.now(), ...r });
    } catch (err) {
      job.posts.push({ pageId: page.id, pageName: page.name, ok: false, at: Date.now(), error: errMsg(err) });
    }
    await saveJob(job);
  }
  const allOk = job.targets.every((t) => job.posts.some((p) => p.pageId === t.pageId && p.ok));
  job.status = allOk ? "done" : "failed";
  job.error = allOk ? undefined : "Có Page đăng lỗi, bấm Thử lại để đăng lại các Page lỗi";
  await saveJob(job);
}

/** Cho job lỗi chạy lại từ bước đang dở. */
export async function retryJob(id: string) {
  const job = await getJob(id);
  if (!job) throw new Error("Không tìm thấy video");
  job.attempts = 0;
  job.error = undefined;
  if (job.videoUrl) {
    job.status = "ready";
    await saveJob(job);
    await postJob(job);
  } else {
    job.status = job.veoOperation ? "rendering" : "queued";
    await saveJob(job);
  }
  return job;
}

// ---------- Vòng xử lý (gọi định kỳ) ----------
/**
 * Đẩy tất cả job đi thêm một bước trong giới hạn thời gian.
 * Được gọi bởi giao diện (khi đang mở), cron của Vercel và cron ngoài.
 */
export async function tick(budgetMs = 200_000) {
  const started = Date.now();
  const timeLeft = () => budgetMs - (Date.now() - started);

  const result = await withLock("tick", Math.ceil(budgetMs / 1000) + 60, async () => {
    const jobs = (await listJobs(300)).reverse(); // cũ trước
    const pages = await getPages();
    const stats = { polled: 0, started: 0, posted: 0 };

    for (const job of jobs.filter((j) => j.status === "rendering")) {
      if (timeLeft() < 20_000) break;
      await pollJob(job);
      stats.polled++;
    }

    for (const job of jobs.filter((j) => j.status === "ready" && j.autoPost)) {
      if (timeLeft() < 30_000) break;
      await postJob(job, pages);
      stats.posted++;
    }

    let rendering = jobs.filter((j) => j.status === "rendering").length;
    for (const job of jobs.filter((j) => j.status === "queued")) {
      // tạo ảnh có thể mất ~1 phút
      if (rendering >= maxParallelRenders() || timeLeft() < 90_000) break;
      await startJob(job);
      if (job.status === "rendering") rendering++;
      stats.started++;
    }
    return stats;
  });

  return result ?? { skipped: "Đang có một lượt xử lý khác chạy" };
}

// ---------- Đợt tự động hằng ngày ----------
export async function runDailyAuto(): Promise<string> {
  const s = await getSettings();
  if (!s.auto.enabled) return "Tự động đang tắt";
  if (vnNow().getUTCHours() < s.auto.hour) return `Chưa tới ${s.auto.hour}h`;
  const claimed = await redis().set(`auto:${vnDateKey()}`, Date.now(), { nx: true, ex: 3 * 86400 });
  if (!claimed) return "Hôm nay đã tạo đợt tự động";

  const times = s.auto.postTimes.length ? s.auto.postTimes : ["11:00", "19:00"];
  try {
    const jobs = await createBatch({
      mode: s.auto.mode,
      perPage: s.auto.perPage,
      autoPost: s.auto.autoPost,
      slot: (n) => {
        const day = Math.floor(n / times.length);
        let t = vnTimeToday(times[n % times.length], day);
        if (t < Date.now() + 60 * 60_000) t += 86400_000; // giờ đã qua → dời sang hôm sau
        return t;
      },
    });
    return `Đã tạo đợt tự động ${jobs.length} video`;
  } catch (err) {
    await redis().del(`auto:${vnDateKey()}`); // cho phép thử lại ở lần cron sau
    throw err;
  }
}
