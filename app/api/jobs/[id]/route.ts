import { handle } from "@/lib/api";
import { deleteJob, getJob, saveJob } from "@/lib/db";
import { postJob, retryJob } from "@/lib/jobs";
import { deleteFiles } from "@/lib/storage";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

async function load(ctx: Ctx) {
  const job = await getJob((await ctx.params).id);
  if (!job) throw new Error("Không tìm thấy video");
  return job;
}

/** Sửa caption / hashtag trước khi đăng. */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const job = await load(ctx);
  const body = await req.json();
  if (typeof body.caption === "string") job.idea.caption = body.caption;
  if (Array.isArray(body.hashtags)) job.idea.hashtags = body.hashtags.map(String);
  await saveJob(job);
  return job;
});

/** Hành động: { action: "post" | "retry" } */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { action } = await req.json();
  const job = await load(ctx);
  if (action === "post") {
    await postJob(job);
    return job;
  }
  if (action === "retry") return retryJob(job.id);
  throw new Error("Hành động không hợp lệ");
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const job = await load(ctx);
  await deleteFiles([job.imageUrl, job.videoUrl]);
  await deleteJob(job.id);
  return { ok: true };
});
