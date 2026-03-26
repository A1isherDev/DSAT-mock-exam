import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import CursorRing from "@/components/CursorRing";
import { ThemeProvider } from "@/components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MasterSAT",
  description: "MasterSAT - Advanced SAT Preparation Platform",
  icons: {
    icon: "/frontend/public/images/logo.png",
    apple: "/frontend/public/images/logo.png",
  },
};

import Script from "next/script";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <CursorRing />
          {children}
        </ThemeProvider>
        <Script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js" strategy="afterInteractive" />
        <Script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js" strategy="afterInteractive" />
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
        <Script id="mathjax-config" strategy="afterInteractive">
          {`
            window.MathJax = {
              tex: {
                inlineMath: [['\\\\(', '\\\\)'], ['$', '$']],
                displayMath: [['\\\\[', '\\\\]'], ['$$', '$$']]
              },
              svg: {
                fontCache: 'global'
              },
              options: {
                ignoreHtmlClass: 'katex', // Don't process what KaTeX already handled
                processHtmlClass: 'mathjax-process'
              }
            };
          `}
        </Script>
        <Script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
