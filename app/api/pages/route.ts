import { handle } from "@/lib/api";
import { getPages, savePages } from "@/lib/db";

/** Không trả token ra trình duyệt. */
export const GET = handle(async () => ({
  pages: (await getPages()).map(({ access_token: _t, ...p }) => p),
}));

/** Bật/tắt Page: { id, enabled } hoặc xoá: { id, remove: true } */
export const PATCH = handle(async (req: Request) => {
  const { id, enabled, remove } = await req.json();
  let pages = await getPages();
  if (remove) pages = pages.filter((p) => p.id !== id);
  else pages = pages.map((p) => (p.id === id ? { ...p, enabled: Boolean(enabled) } : p));
  await savePages(pages);
  return { ok: true };
});
