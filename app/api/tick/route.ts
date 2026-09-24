import { handle } from "@/lib/api";
import { tick } from "@/lib/jobs";

export const maxDuration = 300;

/** Giao diện gọi định kỳ khi đang mở để đẩy các video đi tiếp. */
export const POST = handle(async () => tick(200_000));
