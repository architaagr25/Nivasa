import {
  Fraunces,
  Inter,
  Noto_Sans_Devanagari,
  Noto_Sans_Gujarati,
  Noto_Serif_Devanagari,
  Noto_Serif_Gujarati,
} from "next/font/google";

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

export const fontVariables = [
  inter,
  fraunces,
  notoDevanagari,
  notoGujarati,
  notoSerifDevanagari,
  notoSerifGujarati,
]
  .map((f) => f.variable)
  .join(" ");
