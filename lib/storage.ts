import { del, put } from "@vercel/blob";

/** Lưu file lên Vercel Blob (public, có hậu tố ngẫu nhiên nên URL không đoán được). */
export async function saveFile(pathname: string, data: Buffer, contentType: string): Promise<string> {
  const blob = await put(pathname, data, { access: "public", contentType, addRandomSuffix: true });
  return blob.url;
}

export async function deleteFiles(urls: (string | undefined)[]) {
  const list = urls.filter((u): u is string => Boolean(u));
  if (list.length) await del(list).catch(() => {});
}
