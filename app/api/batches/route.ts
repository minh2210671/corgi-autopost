import { handle } from "@/lib/api";
import { createBatch } from "@/lib/jobs";

export const maxDuration = 120;

export const POST = handle(async (req: Request) => {
  const body = await req.json();
  const startAt = body.startAt ? new Date(body.startAt).getTime() : undefined;
  if (startAt !== undefined && Number.isNaN(startAt)) throw new Error("Thời gian hẹn không hợp lệ");
  const everyMs = (Number(body.everyMinutes) || 180) * 60_000;

  const jobs = await createBatch({
    mode: body.mode === "same" ? "same" : "distribute",
    perPage: Math.max(1, Number(body.perPage) || 1),
    pageIds: Array.isArray(body.pageIds) ? body.pageIds : undefined,
    autoPost: Boolean(body.autoPost),
    style: body.style,
    slot: startAt ? (n) => startAt + n * everyMs : undefined,
  });
  return { created: jobs.length };
});
