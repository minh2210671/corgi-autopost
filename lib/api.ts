import { NextResponse } from "next/server";
import { errMsg } from "./http";

/** Bọc route handler: trả JSON, lỗi thì trả { error } với status 500. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      const data = await fn(...args);
      return data instanceof Response ? data : NextResponse.json(data ?? { ok: true });
    } catch (err) {
      console.error(err);
      return NextResponse.json({ error: errMsg(err) }, { status: 500 });
    }
  };
}
