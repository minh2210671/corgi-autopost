import { handle } from "@/lib/api";
import { getPages, savePages } from "@/lib/db";
import { exchangeLongLivedToken, fetchPages } from "@/lib/facebook";

/** Nhận User token (từ Graph API Explorer), lấy tất cả Page + Page token. */
export const POST = handle(async (req: Request) => {
  const { userToken } = await req.json();
  if (!userToken) throw new Error("Chưa nhập User Access Token");
  const longLived = await exchangeLongLivedToken(String(userToken).trim());
  const fresh = await fetchPages(longLived);
  if (!fresh.length) throw new Error("Token này không quản lý Page nào (kiểm tra quyền pages_show_list)");
  const old = await getPages();
  const merged = [
    ...fresh.map((p) => ({ ...p, enabled: old.find((o) => o.id === p.id)?.enabled ?? true })),
    ...old.filter((o) => !fresh.some((p) => p.id === o.id)),
  ];
  await savePages(merged);
  return { count: fresh.length };
});
