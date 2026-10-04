import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import PageView from "@/components/PageView";
import { AuthProvider } from "@/components/AuthContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PrepMate AI: Your Campus Interview Prep",
  description:
    "Timed voice mock interviews for HR, technical, and company rounds. Get instant AI scores before the real thing.",
  openGraph: {
    title: "PrepMate AI: Your Campus Interview Prep",
    description:
      "Timed voice mock interviews for HR, technical, and company rounds. Get instant AI scores before the real thing.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "PrepMate AI: Your Campus Interview Prep",
    description:
      "Timed voice mock interviews for HR, technical, and company rounds. Get instant AI scores before the real thing.",
    images: ["/og.png"],
  },
};

// Runs before hydration so the saved theme applies without a flash.
// Default is light; the toggle in the navbar persists to localStorage.
const THEME_INIT = `(function(){try{var t=localStorage.getItem("prepmate-theme")||"light";document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="light";}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.className} min-h-screen bg-[var(--bg)] text-[var(--text)]`}
      >
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {/* Auth state lives here so every component updates on login/logout
            without a page reload. */}
        <AuthProvider>
          <PageView />
          {/* Global Navigation (auth-aware: Sign In ↔ Logout) */}
          <Navbar />

          {/* Page Content */}
          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
