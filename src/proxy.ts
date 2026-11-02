import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Buyer pages only. Staff screens are English-only and the API has no locale.
  matcher: ["/((?!api|staff|_next|_vercel|images|.*\\..*).*)"],
};
