import { handle } from "@/lib/api";
import { getPages, listJobs } from "@/lib/db";

export const GET = handle(async () => {
  const [jobs, pages] = await Promise.all([listJobs(80), getPages()]);
  const names = Object.fromEntries(pages.map((p) => [p.id, p.name]));
  return { jobs, pageNames: names };
});
