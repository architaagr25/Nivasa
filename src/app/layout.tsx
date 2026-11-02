import type { Metadata, Viewport } from "next";
import {
  Fraunces,
  Inter,
  Noto_Sans_Devanagari,
  Noto_Sans_Gujarati,
  Noto_Serif_Devanagari,
  Noto_Serif_Gujarati,
} from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
});

// Hindi and Gujarati faces are not preloaded: the browser fetches them only
// when a page actually contains those scripts, which keeps English pages light.
const notoDevanagari = Noto_Sans_Devanagari({
  variable: "--font-noto-devanagari",
  subsets: ["devanagari"],
  preload: false,
});
const notoGujarati = Noto_Sans_Gujarati({
  variable: "--font-noto-gujarati",
  subsets: ["gujarati"],
  preload: false,
});
const notoSerifDevanagari = Noto_Serif_Devanagari({
  variable: "--font-noto-serif-devanagari",
  subsets: ["devanagari"],
  preload: false,
});
const notoSerifGujarati = Noto_Serif_Gujarati({
  variable: "--font-noto-serif-gujarati",
  subsets: ["gujarati"],
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "Nivasa", template: "%s · Nivasa" },
  description: "Homes by Company A, Ahmedabad. Ask questions any time and book a site visit.",
};

export const viewport: Viewport = {
  themeColor: "#f8f5ef",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const fonts = [
    inter,
    fraunces,
    notoDevanagari,
    notoGujarati,
    notoSerifDevanagari,
    notoSerifGujarati,
  ]
    .map((f) => f.variable)
    .join(" ");

  return (
    <html lang="en" className={`${fonts} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
