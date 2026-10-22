import { NextResponse, type NextRequest } from "next/server";

// Cheap edge check only: no cookie → go to login. The real session validation
// (expiry, disabled accounts, permissions) happens on the server for every request.
const PUBLIC = ["/login", "/setup", "/offline", "/manifest.webmanifest", "/sw.js", "/api/health"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (!req.cookies.has("bfms_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icons/|brand/|icon.png|favicon.ico).*)"],
};
