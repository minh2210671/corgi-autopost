import { handle } from "@/lib/api";
import { getSettings, saveSettings } from "@/lib/db";
import type { Settings } from "@/lib/types";

export const GET = handle(getSettings);

export const PUT = handle(async (req: Request) => {
  const body = (await req.json()) as Settings;
  const current = await getSettings();
  const times = (body.auto?.postTimes || []).map((t) => String(t).trim()).filter((t) => /^\d{1,2}:\d{2}$/.test(t));
  const next: Settings = {
    channelStyle: String(body.channelStyle ?? current.channelStyle),
    captionLanguage: String(body.captionLanguage ?? current.captionLanguage),
    auto: {
      enabled: Boolean(body.auto?.enabled),
      hour: Math.min(23, Math.max(0, Number(body.auto?.hour ?? current.auto.hour))),
      perPage: Math.min(10, Math.max(1, Number(body.auto?.perPage ?? current.auto.perPage))),
      mode: body.auto?.mode === "same" ? "same" : "distribute",
      postTimes: times.length ? times : current.auto.postTimes,
      autoPost: Boolean(body.auto?.autoPost),
    },
  };
  await saveSettings(next);
  return next;
});
