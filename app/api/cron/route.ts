import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/auth";
import { errMsg } from "@/lib/http";
import { runDailyAuto, tick } from "@/lib/jobs";

export const maxDuration = 300;

/**
 * Được gọi bởi Vercel Cron (mỗi ngày) và/hoặc dịch vụ cron ngoài (mỗi 5 phút):
 * GET /api/cron?secret=CRON_SECRET
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let auto: string;
  try {
    auto = await runDailyAuto();
  } catch (err) {
    auto = `Lỗi tạo đợt tự động: ${errMsg(err)}`;
  }
  const result = await tick(230_000).catch((err) => ({ error: errMsg(err) }));
  return NextResponse.json({ auto, tick: result });
}
