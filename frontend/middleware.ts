import { NextRequest, NextResponse } from "next/server";

function consoleFromHost(host: string | null): "admin" | "questions" | null {
  if (!host) return null;
  const h = host.split(":")[0].toLowerCase();
  if (h.startsWith("admin.")) return "admin";
  if (h.startsWith("questions.")) return "questions";
  return null;
}

export function middleware(req: NextRequest) {
  const host = req.headers.get("host");
  const console = consoleFromHost(host);
  const res = NextResponse.next();

  // Persist a small, explicit console marker for client components.
  if (console) {
    res.cookies.set("lms_console", console, { path: "/", sameSite: "lax" });
  } else {
    res.cookies.delete("lms_console");
  }

  // Subdomain consoles land on /admin (single-page console for now).
  if (console && req.nextUrl.pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url, { headers: res.headers });
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};

