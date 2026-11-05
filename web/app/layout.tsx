import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CHART Intelligence",
  description: "Independent market analysis and forecast dashboard",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
