import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OTTO — Панель товаров",
  description: "Управление товарами и статусами OTTO"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
