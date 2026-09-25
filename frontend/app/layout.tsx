import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Converge — inspectable plan synthesis",
  description: "Independent plans, traceable provenance, and canonical structure on GenLayer Studio Dev.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
