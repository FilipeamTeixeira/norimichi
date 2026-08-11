import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/layout/TopNav";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Norimichi — Cycling Infrastructure Observatory",
  description:
    "Data-driven cycling infrastructure planning for Japanese cities",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="h-full flex flex-col">
        <TopNav />
        <div className="flex-1 flex overflow-hidden">{children}</div>
      </body>
    </html>
  );
}
