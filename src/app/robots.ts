import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/staff", "/api"] },
    sitemap: `${process.env.BETTER_AUTH_URL}/sitemap.xml`,
  };
}
