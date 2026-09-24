import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Corgi Auto Post",
  description: "Tự tạo video corgi bằng AI và đăng hàng loạt lên Fanpage",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
