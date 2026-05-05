"use client";
import React from "react";
import { usePathname } from "next/navigation";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideSidebar = pathname === "/login" || pathname?.startsWith("/auth/");

  return (
    <html lang="fr">
      <body className="bg-gray-100">
        {hideSidebar ? (
          <main className="min-h-screen">{children}</main>
        ) : (
          <div className="flex min-h-screen">
            <Sidebar />
            {/* pt-14 md:pt-0 : laisse de la place au bouton hamburger sur mobile, qui
                est en position fixed top-3 left-3 et risquerait sinon de masquer le
                titre de la page. */}
            <main className="flex-1 pt-14 md:pt-0">{children}</main>
          </div>
        )}
      </body>
    </html>
  );
}
