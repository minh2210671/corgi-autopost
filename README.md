# Corgi Auto Post 🐶

Web app chạy trên **Vercel**, tự động từ đầu đến cuối:

1. **ChatGPT** lên ý tưởng cảnh corgi, không lặp lại ý tưởng cũ, kèm caption và hashtag.
2. **gpt-image-1** tạo ảnh khung hình đầu.
3. **Veo 3** (Gemini API) biến ảnh thành video dọc 9:16 dài 8 giây, có âm thanh.
4. **Đăng Reels hàng loạt** lên nhiều Fanpage: đăng ngay, hẹn giờ, hoặc chờ bạn duyệt rồi mới đăng.

Giao diện có 3 tab: **Video** (tạo đợt, xem, sửa caption, đăng, thử lại), **Fanpage** (kết nối, bật/tắt Page) và **Cài đặt** (chủ đề kênh, đợt tự động mỗi ngày).

---

## Triển khai lên Vercel (khoảng 10 phút)

### 1. Import repo
Vào **vercel.com/new**, chọn repo `corgi-autopost` và bấm **Deploy**. Lần deploy đầu có thể báo thiếu cấu hình, cứ tiếp tục các bước dưới.

### 2. Kết nối Storage
Trong Project, mở tab **Storage**:
- **Create → Upstash (Redis)**: lưu danh sách video, Page và cài đặt. Gói Free là đủ. Bấm *Connect* vào project.
- **Create → Blob**: lưu ảnh và video. Chọn quyền truy cập **Public**, vì Facebook cần tải video từ link công khai. Bấm *Connect* vào project.

Vercel tự thêm các biến `KV_REST_API_*` và `BLOB_READ_WRITE_TOKEN`.

### 3. Khai báo biến môi trường
Vào **Settings → Environment Variables** và thêm các biến sau (xem đầy đủ trong `.env.example`):

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `APP_PASSWORD` | ✅ | Mật khẩu đăng nhập web |
| `CRON_SECRET` | ✅ | Chuỗi ngẫu nhiên, dùng cho cron |
| `OPENAI_API_KEY` | ✅ | platform.openai.com. Tổ chức phải **Verify Organization** mới dùng được gpt-image-1 |
| `GEMINI_API_KEY` | ✅ | aistudio.google.com. Project phải **bật Billing** mới dùng được Veo |
| `FB_APP_ID`, `FB_APP_SECRET` | nên có | Lấy trong App Facebook (Settings → Basic), giúp Page token **không hết hạn** |
| `VEO_MODEL` … | không | Các biến tuỳ chỉnh khác |

### 4. Deploy lại
Vào **Deployments**, bấm **⋯ → Redeploy** để áp dụng biến môi trường. Mở link `https://<tên-project>.vercel.app` và đăng nhập bằng `APP_PASSWORD`.

> **Thời gian chạy tối đa:** app cần mỗi lượt xử lý chạy được đến 300 giây. Trên gói Hobby, hãy chắc chắn **Fluid Compute** đang bật (Settings → Functions), mặc định là bật với project mới.

---

## Kết nối Fanpage

1. Vào developers.facebook.com, tạo App loại **Business**.
2. Trong tab **Fanpage** của web app, làm theo 3 bước hướng dẫn: lấy User Token từ **Graph API Explorer** với các quyền `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `business_management`, rồi dán vào ô và bấm **Kết nối**.
3. Mọi Page bạn quản lý sẽ hiện ra. Tắt những Page không muốn đăng.

Token lưu ở máy chủ (Redis), không bao giờ gửi ra trình duyệt.

## Sử dụng

- **Tạo đợt**: chọn số video cho mỗi Page, chủ đề (không bắt buộc), tự đăng hay chờ duyệt, có hẹn giờ không, rồi bấm **Tạo video**.
- Video đi qua các trạng thái: *Chờ tạo ảnh* → *Veo đang tạo video* (1–3 phút) → *Video xong* → *Đã đăng*.
- Ở chế độ chờ duyệt, bạn có thể xem video, sửa caption, rồi bấm **Đăng ngay**.
- Nếu một bước lỗi, app tự thử lại tối đa 3 lần. Nếu vẫn lỗi, bấm **Thử lại**: app chỉ đăng lại những Page bị lỗi.

## Xử lý khi đóng trang và đợt tự động mỗi ngày

Khi trang đang mở, trình duyệt tự đẩy các video đi tiếp. Để app **chạy cả khi bạn đóng trang** (bắt buộc nếu dùng đợt tự động mỗi ngày):

- Vercel gói Hobby chỉ cho cron **1 lần/ngày**. App đã cài sẵn cron 7h sáng giờ VN để tạo đợt tự động. Nhưng để video được render và đăng xong, cần gọi cron thường xuyên hơn.
- **Cách miễn phí**: tạo tài khoản **cron-job.org**, thêm job gọi URL sau **mỗi 5 phút**:
  ```
  https://<tên-project>.vercel.app/api/cron?secret=<CRON_SECRET>
  ```
- Nếu dùng Vercel Pro, có thể sửa `vercel.json` thành `"schedule": "*/5 * * * *"`.

Bật đợt tự động trong tab **Cài đặt**: chọn giờ tạo đợt, số video mỗi Page mỗi ngày và các giờ đăng (ví dụ `11:00, 19:00`).

## Chi phí và lưu ý

- **Veo** tính tiền theo giây video và là khoản tốn nhất. Hãy thử 1 video trước để biết giá thực tế.
- **Vercel Blob** gói Free có dung lượng giới hạn. Nên xoá video cũ đã đăng (nút **Xoá** sẽ xoá cả file).
- Nên dùng chế độ **mỗi Page một video riêng** để tránh bị Facebook coi là spam do nội dung trùng lặp.
- Facebook chỉ cho hẹn giờ trong khoảng từ 10 phút đến 75 ngày. Nếu video xong khi đã qua giờ hẹn, app sẽ đăng ngay.

## Chạy trên máy (tuỳ chọn)

```bash
npm install
cp .env.example .env.local   # điền key + URL/Token Upstash + BLOB_READ_WRITE_TOKEN
npm run dev
```
