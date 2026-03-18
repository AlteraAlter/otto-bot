import type { Metadata } from "next";
import { Manrope, Outfit } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope"
});

const outfit = Outfit({
  subsets: ["latin", "latin-ext"],
  variable: "--font-outfit"
});

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
      <body className={`${manrope.variable} ${outfit.variable}`}>{children}</body>
    </html>
  );
}
