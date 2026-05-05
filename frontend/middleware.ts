import { NextRequest, NextResponse } from "next/server";

function consoleFromHost(host: string | null): "admin" | "questions" | null {
  if (!host) return null;
  const h = host.split(":")[0].toLowerCase();
  const labels = h.split(".").filter(Boolean);
  if (!labels.length) return null;
  if (labels[0] === "admin" || h.startsWith("admin.")) return "admin";
  if (labels[0] === "questions" || h.startsWith("questions.")) return "questions";
  if (labels.length >= 2 && labels[1] === "questions") return "questions";
  return null;
}

export function middleware(req: NextRequest) {
  const host = req.headers.get("host");
  const console = consoleFromHost(host);
  const res = NextResponse.next();
  const pathname = req.nextUrl.pathname;

  // Persist a small, explicit console marker for client components.
  if (console) {
    res.cookies.set("lms_console", console, { path: "/", sameSite: "lax" });
  } else {
    res.cookies.delete("lms_console");
  }

  // Questions console: dedicated Question Bank only.
  if (console === "questions") {
    const allowPrefixes = [
      "/questions/bank",
      "/login",
      "/register",
      "/security",
      "/frozen",
      "/_not-found",
    ];
    const allowed = allowPrefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));

    if (pathname === "/") {
      const url = req.nextUrl.clone();
      url.pathname = "/questions/bank";
      return NextResponse.redirect(url, { headers: res.headers });
    }

    if (!allowed) {
      const url = req.nextUrl.clone();
      url.pathname = "/questions/bank";
      url.search = "";
      return NextResponse.redirect(url, { headers: res.headers });
    }
  }

  // Admin console can continue to land on /admin.
  if (console === "admin" && pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url, { headers: res.headers });
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};

