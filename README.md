# Corgi Auto Post 🐶

Công cụ tự động chạy từ đầu đến cuối:

1. **Lên ý tưởng**: ChatGPT (OpenAI) nghĩ ra các cảnh corgi, không trùng với những ý tưởng đã dùng (lưu ở `data/history.json`). Mỗi ý tưởng có prompt ảnh, prompt video, caption và hashtag.
2. **Tạo ảnh**: OpenAI Images API (`gpt-image-1`) tạo khung hình đầu dạng dọc.
3. **Tạo video**: **Veo 3** qua Gemini API tạo video ngắn 9:16 có âm thanh từ ảnh đó.
4. **Đăng hàng loạt**: đăng dạng **Reels** lên nhiều Fanpage Facebook, đăng ngay hoặc hẹn giờ.

Không phải cài thư viện nào, chỉ cần **Node.js ≥ 20**.

## Cài đặt

```bash
cd corgi-autopost
cp .env.example .env              # điền OPENAI_API_KEY, GEMINI_API_KEY
```

### Lấy key

| Dịch vụ | Nơi lấy | Ghi chú |
|---|---|---|
| OpenAI | platform.openai.com → API keys | Tổ chức phải **Verify Organization** thì mới dùng được `gpt-image-1` |
| Gemini / Veo | aistudio.google.com → Get API key | Veo phải dùng project **có bật thanh toán** (gói trả phí) |
| Facebook | developers.facebook.com → tạo App (Business) | Xem phần dưới |

### Kết nối Fanpage

1. Tạo App trên Meta for Developers, vào **Graph API Explorer**, chọn App, lấy **User Token** với các quyền:
   `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `business_management`.
2. Đổi sang token dài hạn (Access Token Debugger → *Extend Access Token*), rồi dán vào `FB_USER_ACCESS_TOKEN` trong `.env`.
3. Chạy:
   ```bash
   node src/cli.mjs pages:sync
   ```
   Lệnh này tạo `pages.json` gồm mọi Page bạn quản lý, kèm Page token (Page token lấy từ user token dài hạn thì không hết hạn).
   Page nào không muốn đăng thì sửa `"enabled": false`.

> `.env` và `pages.json` chứa token bí mật và **không được commit** (đã có trong `.gitignore`).

## Sử dụng

```bash
# Chạy thử toàn bộ luồng, không gọi API nào (dùng pages.example.json)
node src/cli.mjs run --count 2 --dry-run

# Chỉ xem ý tưởng
node src/cli.mjs ideas --count 5

# Mỗi Page nhận 1 video KHÁC NHAU, đăng ngay (nghỉ khoảng 60 giây giữa các bài)
node src/cli.mjs run

# Mỗi Page nhận 3 video, hẹn giờ từ 8h sáng mai, mỗi bài cách nhau 3 tiếng
node src/cli.mjs run --per-page 3 --start-at 2026-09-25T08:00+07:00 --every 180

# 1 video đăng lên TẤT CẢ Page
node src/cli.mjs run --count 1 --mode same

# Chỉ tạo video, chưa đăng; xem lại rồi mới đăng
node src/cli.mjs run --count 4 --no-post
node src/cli.mjs post --dir output/2026-09-24-08-00-00-01-corgi-...

# Chỉ đăng lên vài Page cụ thể
node src/cli.mjs run --pages 1234567890,2345678901
```

Mỗi video nằm trong `output/<thời-gian>-<tên>/` gồm `image.png`, `video.mp4` và `meta.json` (ý tưởng, caption, kết quả đăng lên từng Page).
Chạy lại `post` cho cùng thư mục sẽ **bỏ qua các Page đã đăng thành công**, nên có thể thử lại những Page bị lỗi mà không đăng trùng.

## Tự chạy hằng ngày (cron)

```cron
# 7h sáng mỗi ngày (máy đặt giờ VN): tạo 2 video/Page, hẹn đăng 11h và 19h
0 7 * * * cd /đường-dẫn/corgi-autopost && node src/cli.mjs run --per-page 2 --start-at "$(date +\%F)T11:00+07:00" --every 480 >> run.log 2>&1
```

## Tuỳ chỉnh

- `CHANNEL_STYLE` trong `.env`: định hướng nội dung (ví dụ: "corgi đi du lịch Việt Nam", "corgi làm việc văn phòng hài hước").
- `VEO_MODEL`: `veo-3.1-fast-generate-preview` (rẻ và nhanh, mặc định), `veo-3.1-generate-preview` (đẹp hơn), `veo-3.0-generate-001`.
- Prompt hệ thống để lên ý tưởng nằm trong `src/ideas.mjs`.

## Lưu ý

- **Chi phí**: Veo tính tiền theo giây video, và đây là khoản tốn nhất. Nên chạy `--dry-run` và `--count 1` trước để kiểm tra.
- **Tránh bị Facebook đánh spam**: nên dùng `--mode distribute` (mỗi Page một video riêng) thay vì đăng cùng một video lên nhiều Page. Đăng giãn cách, không quá dày.
- Facebook chỉ cho hẹn giờ trong khoảng **10 phút đến 75 ngày** kể từ lúc chạy lệnh.
- Reels yêu cầu video dọc 9:16, dài 3–90 giây. Veo trả video 720p/1080p dài 8 giây, đạt yêu cầu.
- Nếu Veo từ chối một ảnh hoặc prompt vì bộ lọc an toàn, video đó được ghi là lỗi, công cụ vẫn chạy tiếp các video còn lại.
