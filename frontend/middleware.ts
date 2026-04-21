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

  // Persist a small, explicit console marker for client components.
  if (console) {
    res.cookies.set("lms_console", console, { path: "/", sameSite: "lax" });
  } else {
    res.cookies.delete("lms_console");
  }

  // Subdomain consoles land on their dedicated roots.
  if (console && req.nextUrl.pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = console === "questions" ? "/builder/sets" : "/assessments/assign";
    return NextResponse.redirect(url, { headers: res.headers });
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};

