#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { generateIdeas } from "./ideas.mjs";
import { generateImage } from "./image.mjs";
import { generateVideo } from "./video.mjs";
import { fetchPagesFromUserToken, postReel } from "./facebook.mjs";
import { ROOT, loadEnv, log, readJson, sleep, slugify, writeJson } from "./util.mjs";

loadEnv();

const PAGES_FILE = path.join(ROOT, "pages.json");
const HISTORY_FILE = path.join(ROOT, "data", "history.json");
const OUTPUT_DIR = path.join(ROOT, "output");

const HELP = `Corgi Auto Post – ý tưởng (ChatGPT) → ảnh (gpt-image) → video (Veo 3) → đăng Reels lên nhiều Fanpage

Lệnh:
  run          Chạy trọn quy trình
    --count N           Số video cần tạo (mặc định = số Page đang bật)
    --per-page K        Mỗi Page nhận K video khác nhau (count = K × số Page)
    --mode M            distribute (mặc định: mỗi video về 1 Page, xoay vòng)
                        | same (mỗi video đăng lên TẤT CẢ Page)
    --pages a,b         Chỉ dùng các Page id này
    --start-at ISO      Hẹn giờ đăng trên Facebook, ví dụ 2026-09-25T08:00+07:00
    --every PHÚT        Khoảng cách giữa các bài của cùng 1 Page khi hẹn giờ (mặc định 180)
    --delay GIÂY        Nghỉ giữa các lần đăng ngay (mặc định 60, có dao động ngẫu nhiên)
    --no-post           Chỉ tạo ảnh + video, không đăng
    --dry-run           Chạy thử, không gọi API nào (để kiểm tra luồng)
  ideas        Chỉ sinh ý tưởng và in ra      (--count N)
  post         Đăng lại 1 video đã tạo          (--dir output/<thư-mục> [--pages a,b] [--start-at ISO])
  pages:sync   Lấy danh sách Page + Page token từ FB_USER_ACCESS_TOKEN → ghi pages.json
`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) args._.push(a);
    else if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) args[a.slice(2)] = true;
    else args[a.slice(2)] = argv[++i];
  }
  return args;
}

function loadPages(filter, dryRun) {
  let pages = readJson(PAGES_FILE, null);
  if (!pages) {
    if (!dryRun) throw new Error("Chưa có pages.json – chạy `pages:sync` hoặc copy pages.example.json");
    pages = readJson(path.join(ROOT, "pages.example.json"), []);
  }
  pages = pages.filter((p) => p.enabled !== false);
  if (filter) {
    const ids = String(filter).split(",").map((s) => s.trim());
    pages = pages.filter((p) => ids.includes(p.id));
  }
  if (!pages.length) throw new Error("Không có Page nào được bật");
  return pages;
}

const buildCaption = (idea) => [idea.caption, (idea.hashtags || []).join(" ")].filter(Boolean).join("\n\n");

/** Tạo ảnh + video cho 1 ý tưởng, lưu vào output/<ngày>-<slug>/ */
async function produce(idea, index, total, dryRun) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const dir = path.join(OUTPUT_DIR, `${stamp}-${String(index + 1).padStart(2, "0")}-${slugify(idea.title)}`);
  fs.mkdirSync(dir, { recursive: true });
  const meta = { ...idea, createdAt: new Date().toISOString(), posts: [] };
  writeJson(path.join(dir, "meta.json"), meta);

  log(`[${index + 1}/${total}] 🐶 ${idea.title}`);
  log("  → Tạo ảnh bằng ChatGPT…");
  const imageFile = await generateImage({ prompt: idea.image_prompt, outFile: path.join(dir, "image.png"), dryRun });
  log("  → Tạo video bằng Veo 3…");
  const videoFile = await generateVideo({
    prompt: idea.video_prompt,
    imageFile,
    outFile: path.join(dir, "video.mp4"),
    dryRun,
  });
  log(`  ✓ Xong: ${path.relative(ROOT, videoFile)}`);
  return dir;
}

/** Đăng video trong thư mục `dir` lên các page; ghi kết quả vào meta.json, bỏ qua page đã đăng. */
async function publish(dir, pages, { scheduleFor, delaySec, dryRun }) {
  const metaFile = path.join(dir, "meta.json");
  const meta = readJson(metaFile);
  const results = [];
  for (const page of pages) {
    if (meta.posts.some((p) => p.pageId === page.id && p.ok && !p.dryRun)) {
      log(`  = Đã đăng trên "${page.name}" trước đó, bỏ qua`);
      continue;
    }
    const scheduledAt = scheduleFor?.(page);
    try {
      const r = await postReel({
        page,
        videoFile: path.join(dir, "video.mp4"),
        description: buildCaption(meta),
        scheduledAt,
        dryRun,
      });
      log(`  ✓ ${scheduledAt ? `Hẹn ${scheduledAt.toLocaleString("vi-VN")}` : "Đã đăng"} → ${page.name}`);
      meta.posts.push({ pageId: page.id, pageName: page.name, ok: true, at: new Date().toISOString(), ...r });
      results.push(true);
    } catch (err) {
      log(`  ✗ Lỗi đăng "${page.name}": ${err.message}`);
      meta.posts.push({ pageId: page.id, pageName: page.name, ok: false, error: err.message, at: new Date().toISOString() });
      results.push(false);
    }
    writeJson(metaFile, meta);
    if (!scheduledAt && !dryRun && delaySec > 0) await sleep((delaySec * (0.7 + Math.random() * 0.6)) * 1000);
  }
  return results;
}

async function cmdRun(args) {
  const dryRun = Boolean(args["dry-run"]);
  const pages = loadPages(args.pages, dryRun);
  const mode = args.mode || "distribute";
  if (!["distribute", "same"].includes(mode)) throw new Error("--mode phải là distribute hoặc same");
  const count = Number(args.count) || (Number(args["per-page"]) || 1) * (mode === "distribute" ? pages.length : 1);
  const delaySec = args.delay !== undefined ? Number(args.delay) : 60;
  const every = Number(args.every) || 180;
  const startAt = args["start-at"] ? new Date(args["start-at"]) : null;
  if (startAt && Number.isNaN(startAt.getTime())) throw new Error("--start-at không hợp lệ");

  log(`Bắt đầu: ${count} video, ${pages.length} Page, chế độ ${mode}${dryRun ? " (DRY-RUN)" : ""}`);

  const history = readJson(HISTORY_FILE, []);
  const ideas = await generateIdeas({ count, usedTitles: history.map((h) => h.title), dryRun });
  log(`Đã có ${ideas.length} ý tưởng từ ChatGPT`);

  const slotCount = new Map(); // số bài đã xếp lịch cho mỗi Page
  const scheduleFor = startAt
    ? (page) => {
        const n = slotCount.get(page.id) || 0;
        slotCount.set(page.id, n + 1);
        return new Date(startAt.getTime() + n * every * 60_000);
      }
    : null;

  const summary = { produced: 0, failed: 0, posted: 0, postFailed: 0 };
  for (let i = 0; i < ideas.length; i++) {
    let dir;
    try {
      dir = await produce(ideas[i], i, ideas.length, dryRun);
      summary.produced++;
      if (!dryRun) {
        history.push({ title: ideas[i].title, at: new Date().toISOString() });
        writeJson(HISTORY_FILE, history);
      }
    } catch (err) {
      summary.failed++;
      log(`  ✗ Lỗi tạo nội dung: ${err.message}`);
      continue;
    }
    if (args["no-post"]) continue;
    const targets = mode === "same" ? pages : [pages[i % pages.length]];
    const results = await publish(dir, targets, { scheduleFor, delaySec, dryRun });
    summary.posted += results.filter(Boolean).length;
    summary.postFailed += results.filter((r) => !r).length;
  }

  log(
    `Hoàn tất. Video tạo được: ${summary.produced}, lỗi tạo: ${summary.failed}, ` +
      `bài đăng OK: ${summary.posted}, bài đăng lỗi: ${summary.postFailed}`,
  );
  if (summary.failed || summary.postFailed) process.exitCode = 1;
}

async function cmdIdeas(args) {
  const history = readJson(HISTORY_FILE, []);
  const ideas = await generateIdeas({
    count: Number(args.count) || 5,
    usedTitles: history.map((h) => h.title),
    dryRun: Boolean(args["dry-run"]),
  });
  console.log(JSON.stringify(ideas, null, 2));
}

async function cmdPost(args) {
  if (!args.dir) throw new Error("Cần --dir output/<thư-mục>");
  const dir = path.resolve(ROOT, args.dir);
  const dryRun = Boolean(args["dry-run"]);
  const pages = loadPages(args.pages, dryRun);
  const startAt = args["start-at"] ? new Date(args["start-at"]) : null;
  const results = await publish(dir, pages, {
    scheduleFor: startAt ? () => startAt : null,
    delaySec: args.delay !== undefined ? Number(args.delay) : 60,
    dryRun,
  });
  if (results.some((r) => !r)) process.exitCode = 1;
}

async function cmdPagesSync() {
  const fresh = await fetchPagesFromUserToken();
  const old = readJson(PAGES_FILE, []);
  const merged = fresh.map((p) => ({ ...p, enabled: old.find((o) => o.id === p.id)?.enabled ?? true }));
  writeJson(PAGES_FILE, merged);
  log(`Đã lưu ${merged.length} Page vào pages.json:`);
  for (const p of merged) log(`  - ${p.name} (${p.id})${p.enabled ? "" : " [tắt]"}`);
}

const args = parseArgs(process.argv.slice(2));
const commands = { run: cmdRun, ideas: cmdIdeas, post: cmdPost, "pages:sync": cmdPagesSync };
const cmd = commands[args._[0]];
if (!cmd || args.help) {
  console.log(HELP);
} else {
  cmd(args).catch((err) => {
    console.error(`LỖI: ${err.message}`);
    process.exit(1);
  });
}
