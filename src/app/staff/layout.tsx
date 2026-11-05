import type { Metadata } from "next";
import { fontVariables } from "../fonts";
import "../globals.css";

export const metadata: Metadata = {
  title: { default: "Nivasa for sales", template: "%s · Nivasa for sales" },
  description: "Leads, site visits and chat reviews for the Nivasa sales team.",
  robots: { index: false, follow: false },
};

export default function StaffRootLayout({ children }: LayoutProps<"/staff">) {
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full bg-background">{children}</body>
    </html>
  );
}
