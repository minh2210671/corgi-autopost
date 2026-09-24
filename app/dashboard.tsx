"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Job, Settings } from "@/lib/types";

type Tab = "videos" | "pages" | "settings";
type PageInfo = { id: string; name: string; enabled: boolean };
type Check = { name: string; ok: boolean; hint: string; optional?: boolean };

async function api<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Chưa đăng nhập");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
  return data;
}

const fmtTime = (ms?: number) =>
  ms ? new Date(ms).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "";

const STATUS: Record<Job["status"], { label: string; cls: string }> = {
  queued: { label: "Chờ tạo ảnh", cls: "gray" },
  rendering: { label: "Veo đang tạo video", cls: "blue" },
  ready: { label: "Video xong – chờ đăng", cls: "amber" },
  done: { label: "Đã đăng", cls: "green" },
  failed: { label: "Lỗi", cls: "red" },
};

const isActive = (j: Job) => j.status === "queued" || j.status === "rendering" || (j.status === "ready" && j.autoPost);

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("videos");
  const [checks, setChecks] = useState<Check[]>([]);

  useEffect(() => {
    api<{ checks: Check[] }>("/api/status").then((d) => setChecks(d.checks)).catch(() => {});
  }, []);

  const missing = checks.filter((c) => !c.ok && !c.optional);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="logo-sm">🐶</span> Corgi Auto Post
        </div>
        <nav className="tabs">
          {(
            [
              ["videos", "Video"],
              ["pages", "Fanpage"],
              ["settings", "Cài đặt"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </nav>
        <button
          className="btn ghost small"
          onClick={() => api("/api/logout", { method: "POST" }).then(() => (window.location.href = "/login"))}
        >
          Đăng xuất
        </button>
      </header>

      <main className="content">
        {missing.length > 0 && (
          <div className="banner">
            <strong>Chưa cấu hình đủ trên Vercel:</strong>
            <ul>
              {missing.map((c) => (
                <li key={c.name}>
                  <code>{c.name}</code> – {c.hint}
                </li>
              ))}
            </ul>
          </div>
        )}
        {tab === "videos" && <VideosTab />}
        {tab === "pages" && <PagesTab />}
        {tab === "settings" && <SettingsTab />}
      </main>
    </div>
  );
}

// ======================= VIDEO =======================
function VideosTab() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pageNames, setPageNames] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [ticking, setTicking] = useState(false);
  const tickRef = useRef(false);

  const refresh = useCallback(async () => {
    const d = await api<{ jobs: Job[]; pageNames: Record<string, string> }>("/api/jobs");
    setJobs(d.jobs);
    setPageNames(d.pageNames);
    setLoaded(true);
    return d.jobs;
  }, []);

  // Khi trang đang mở: tải lại danh sách và đẩy các video đang xử lý đi tiếp
  useEffect(() => {
    let stop = false;
    const loop = async () => {
      try {
        const list = await refresh();
        if (!tickRef.current && list.some(isActive)) {
          tickRef.current = true;
          setTicking(true);
          api("/api/tick", { method: "POST" })
            .catch(() => {})
            .finally(() => {
              tickRef.current = false;
              setTicking(false);
              if (!stop) refresh().catch(() => {});
            });
        }
      } catch {}
    };
    loop();
    const t = setInterval(loop, 8000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [refresh]);

  const active = jobs.filter(isActive).length;

  return (
    <>
      <NewBatchForm onCreated={refresh} />
      <div className="section-head">
        <h2>Video gần đây</h2>
        {active > 0 && (
          <span className="pill blue">
            <span className="spinner" /> {active} video đang xử lý{ticking ? "…" : ""}
          </span>
        )}
      </div>
      {active > 0 && (
        <p className="muted small">
          Giữ trang này mở để video được xử lý liên tục, hoặc cài cron ngoài (xem README) để chạy cả khi đóng trang.
        </p>
      )}
      {!loaded && <p className="muted">Đang tải…</p>}
      {loaded && !jobs.length && <p className="empty">Chưa có video nào. Tạo đợt đầu tiên ở trên nhé!</p>}
      <div className="grid">
        {jobs.map((j) => (
          <JobCard key={j.id} job={j} pageNames={pageNames} onChange={refresh} />
        ))}
      </div>
    </>
  );
}

function NewBatchForm({ onCreated }: { onCreated: () => void }) {
  const [mode, setMode] = useState<"distribute" | "same">("distribute");
  const [perPage, setPerPage] = useState(1);
  const [autoPost, setAutoPost] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [startAt, setStartAt] = useState("");
  const [every, setEvery] = useState(180);
  const [style, setStyle] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ created: number }>("/api/batches", {
        method: "POST",
        json: {
          mode,
          perPage,
          autoPost,
          style,
          startAt: schedule && startAt ? new Date(startAt).toISOString() : undefined,
          everyMinutes: every,
        },
      });
      setMsg({ ok: true, text: `ChatGPT đã lên ${r.created} ý tưởng. Đang tạo ảnh và video…` });
      onCreated();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Tạo đợt video mới</h2>
      <div className="row">
        <label>
          Cách phân phối
          <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="distribute">Mỗi Page một video riêng (khuyên dùng)</option>
            <option value="same">Một video đăng lên tất cả Page</option>
          </select>
        </label>
        <label>
          {mode === "distribute" ? "Số video cho mỗi Page" : "Tổng số video"}
          <input type="number" min={1} max={10} value={perPage} onChange={(e) => setPerPage(Number(e.target.value))} />
        </label>
      </div>
      <label>
        Chủ đề riêng cho đợt này (để trống = dùng phong cách trong Cài đặt)
        <input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="VD: corgi đi biển mùa hè, corgi đón Trung thu…" />
      </label>
      <div className="row checks">
        <label className="check">
          <input type="checkbox" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)} />
          Tự đăng ngay khi video xong (bỏ chọn = chờ mình duyệt)
        </label>
        <label className="check">
          <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} />
          Hẹn giờ đăng
        </label>
      </div>
      {schedule && (
        <div className="row">
          <label>
            Bài đầu tiên lúc
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
          </label>
          <label>
            Các bài cùng Page cách nhau (phút)
            <input type="number" min={15} value={every} onChange={(e) => setEvery(Number(e.target.value))} />
          </label>
        </div>
      )}
      <div className="actions">
        <button className="btn primary" disabled={busy}>
          {busy ? "ChatGPT đang lên ý tưởng…" : "Tạo video"}
        </button>
        {msg && <span className={msg.ok ? "ok-text" : "error"}>{msg.text}</span>}
      </div>
    </form>
  );
}

function JobCard({ job, pageNames, onChange }: { job: Job; pageNames: Record<string, string>; onChange: () => void }) {
  const [caption, setCaption] = useState(job.idea.caption);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const st = STATUS[job.status];
  const editable = job.status !== "done";

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setErr("");
    try {
      await fn();
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const saveCaption = () => api(`/api/jobs/${job.id}`, { method: "PATCH", json: { caption } });

  return (
    <article className="card job">
      <div className="media">
        {job.videoUrl ? (
          <video src={job.videoUrl} poster={job.imageUrl} controls playsInline preload="none" />
        ) : job.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={job.imageUrl} alt={job.idea.title} />
        ) : (
          <div className="placeholder">{job.status === "failed" ? "⚠️" : <span className="spinner big" />}</div>
        )}
        <span className={`pill ${st.cls} overlay`}>
          {(job.status === "queued" || job.status === "rendering") && <span className="spinner" />}
          {st.label}
        </span>
      </div>
      <div className="body">
        <h3>{job.idea.title}</h3>
        {editable ? (
          <textarea value={caption} rows={3} onChange={(e) => setCaption(e.target.value)} onBlur={() => caption !== job.idea.caption && saveCaption()} />
        ) : (
          <p className="caption">{job.idea.caption}</p>
        )}
        <p className="tags">{job.idea.hashtags.join(" ")}</p>

        <ul className="targets">
          {job.targets.map((t) => {
            const post = job.posts.find((p) => p.pageId === t.pageId);
            return (
              <li key={t.pageId}>
                <span>{pageNames[t.pageId] || t.pageId}</span>
                {post?.ok ? (
                  <span className="ok-text">{post.scheduledAt ? `✓ hẹn ${fmtTime(post.scheduledAt)}` : "✓ đã đăng"}</span>
                ) : post ? (
                  <span className="error" title={post.error}>
                    ✗ lỗi
                  </span>
                ) : (
                  <span className="muted">{t.scheduleAt ? `hẹn ${fmtTime(t.scheduleAt)}` : "đăng khi xong"}</span>
                )}
              </li>
            );
          })}
        </ul>

        {(job.error || err) && <p className="error small">{err || job.error}</p>}
        {job.posts
          .filter((p) => !p.ok)
          .map((p) => (
            <p key={p.pageId} className="error small">
              {p.pageName}: {p.error}
            </p>
          ))}

        <div className="actions">
          {job.status === "ready" && (
            <button
              className="btn primary small"
              disabled={!!busy}
              onClick={() =>
                act("post", async () => {
                  if (caption !== job.idea.caption) await saveCaption();
                  await api(`/api/jobs/${job.id}`, { method: "POST", json: { action: "post" } });
                })
              }
            >
              {busy === "post" ? "Đang đăng…" : "Đăng ngay"}
            </button>
          )}
          {job.status === "failed" && (
            <button
              className="btn small"
              disabled={!!busy}
              onClick={() => act("retry", () => api(`/api/jobs/${job.id}`, { method: "POST", json: { action: "retry" } }))}
            >
              {busy === "retry" ? "Đang thử lại…" : "Thử lại"}
            </button>
          )}
          {job.videoUrl && (
            <a className="btn ghost small" href={job.videoUrl} target="_blank" rel="noreferrer" download>
              Tải video
            </a>
          )}
          <button
            className="btn ghost small danger"
            disabled={!!busy}
            onClick={() => confirm("Xoá video này?") && act("delete", () => api(`/api/jobs/${job.id}`, { method: "DELETE" }))}
          >
            Xoá
          </button>
        </div>
        <p className="muted tiny">Tạo lúc {fmtTime(job.createdAt)}</p>
      </div>
    </article>
  );
}

// ======================= FANPAGE =======================
function PagesTab() {
  const [pages, setPages] = useState<PageInfo[] | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => api<{ pages: PageInfo[] }>("/api/pages").then((d) => setPages(d.pages)), []);
  useEffect(() => {
    load().catch((e) => setMsg({ ok: false, text: e.message }));
  }, [load]);

  async function sync(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ count: number }>("/api/pages/sync", { method: "POST", json: { userToken: token } });
      setMsg({ ok: true, text: `Đã kết nối ${r.count} Fanpage` });
      setToken("");
      load();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const update = (json: object) => api("/api/pages", { method: "PATCH", json }).then(load);

  return (
    <>
      <form className="card form" onSubmit={sync}>
        <h2>Kết nối Fanpage</h2>
        <ol className="steps">
          <li>
            Mở{" "}
            <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer">
              Graph API Explorer
            </a>
            , chọn App của bạn.
          </li>
          <li>
            Bấm <b>Generate Access Token</b>, tích quyền <code>pages_show_list</code>, <code>pages_read_engagement</code>,{" "}
            <code>pages_manage_posts</code>, <code>business_management</code>.
          </li>
          <li>Copy token và dán vào đây. Mọi Page bạn quản lý sẽ được thêm vào.</li>
        </ol>
        <label>
          User Access Token
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAG…" />
        </label>
        <div className="actions">
          <button className="btn primary" disabled={busy || !token}>
            {busy ? "Đang kết nối…" : "Kết nối / cập nhật Page"}
          </button>
          {msg && <span className={msg.ok ? "ok-text" : "error"}>{msg.text}</span>}
        </div>
      </form>

      <div className="section-head">
        <h2>Danh sách Fanpage</h2>
        {pages && <span className="muted">{pages.filter((p) => p.enabled).length} đang bật</span>}
      </div>
      {pages && !pages.length && <p className="empty">Chưa có Page nào.</p>}
      <div className="card list">
        {pages?.map((p) => (
          <div key={p.id} className="list-row">
            <div>
              <b>{p.name}</b>
              <div className="muted tiny">{p.id}</div>
            </div>
            <div className="actions">
              <label className="switch">
                <input type="checkbox" checked={p.enabled} onChange={(e) => update({ id: p.id, enabled: e.target.checked })} />
                <span>{p.enabled ? "Đang bật" : "Đang tắt"}</span>
              </label>
              <button className="btn ghost small danger" onClick={() => confirm(`Gỡ ${p.name}?`) && update({ id: p.id, remove: true })}>
                Gỡ
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ======================= CÀI ĐẶT =======================
function SettingsTab() {
  const [s, setS] = useState<Settings | null>(null);
  const [times, setTimes] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<Settings>("/api/settings")
      .then((d) => {
        setS(d);
        setTimes(d.auto.postTimes.join(", "));
      })
      .catch((e) => setMsg({ ok: false, text: e.message }));
  }, []);

  if (!s) return <p className="muted">{msg?.text || "Đang tải…"}</p>;
  const setAuto = (patch: Partial<Settings["auto"]>) => setS({ ...s, auto: { ...s.auto, ...patch } });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const saved = await api<Settings>("/api/settings", {
        method: "PUT",
        json: { ...s, auto: { ...s!.auto, postTimes: times.split(",").map((t) => t.trim()) } },
      });
      setS(saved);
      setTimes(saved.auto.postTimes.join(", "));
      setMsg({ ok: true, text: "Đã lưu" });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }

  return (
    <form className="card form" onSubmit={save}>
      <h2>Nội dung</h2>
      <label>
        Phong cách / chủ đề kênh (ChatGPT dựa vào đây để lên ý tưởng)
        <textarea rows={3} value={s.channelStyle} onChange={(e) => setS({ ...s, channelStyle: e.target.value })} />
      </label>
      <label>
        Ngôn ngữ caption
        <select value={s.captionLanguage} onChange={(e) => setS({ ...s, captionLanguage: e.target.value })}>
          <option value="vi">Tiếng Việt</option>
          <option value="English">English</option>
        </select>
      </label>

      <h2>Tự động mỗi ngày</h2>
      <label className="check">
        <input type="checkbox" checked={s.auto.enabled} onChange={(e) => setAuto({ enabled: e.target.checked })} />
        Bật: mỗi ngày tự tạo một đợt video
      </label>
      <div className="row">
        <label>
          Tạo đợt lúc (giờ VN)
          <input type="number" min={0} max={23} value={s.auto.hour} onChange={(e) => setAuto({ hour: Number(e.target.value) })} />
        </label>
        <label>
          Số video mỗi Page / ngày
          <input type="number" min={1} max={10} value={s.auto.perPage} onChange={(e) => setAuto({ perPage: Number(e.target.value) })} />
        </label>
      </div>
      <div className="row">
        <label>
          Cách phân phối
          <select value={s.auto.mode} onChange={(e) => setAuto({ mode: e.target.value as Settings["auto"]["mode"] })}>
            <option value="distribute">Mỗi Page một video riêng</option>
            <option value="same">Một video lên tất cả Page</option>
          </select>
        </label>
        <label>
          Giờ đăng trong ngày (cách nhau bằng dấu phẩy)
          <input value={times} onChange={(e) => setTimes(e.target.value)} placeholder="11:00, 19:00" />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={s.auto.autoPost} onChange={(e) => setAuto({ autoPost: e.target.checked })} />
        Tự hẹn giờ đăng khi video xong (bỏ chọn = chờ mình duyệt)
      </label>
      <p className="muted small">
        Vercel gói miễn phí chỉ chạy cron 1 lần/ngày (khoảng 7h sáng). Để video được xử lý và đăng đúng giờ khi không mở
        trang, hãy cài cron ngoài gọi <code>/api/cron?secret=CRON_SECRET</code> mỗi 5 phút (xem README).
      </p>
      <div className="actions">
        <button className="btn primary">Lưu cài đặt</button>
        {msg && <span className={msg.ok ? "ok-text" : "error"}>{msg.text}</span>}
      </div>
    </form>
  );
}
