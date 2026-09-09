import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Certify — Certificate Issuance & Verification",
  description: "Issue, manage, and verify event certificates."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
