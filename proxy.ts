import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionValue } from "./lib/auth";

const PUBLIC_PATHS = ["/login", "/api/login", "/api/cron"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  if (!process.env.APP_PASSWORD) {
    return new NextResponse("Chưa đặt APP_PASSWORD trong Environment Variables của Vercel.", { status: 500 });
  }
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && cookie === (await sessionValue())) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
