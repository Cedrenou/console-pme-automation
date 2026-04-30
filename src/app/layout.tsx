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
            <main className="flex-1">{children}</main>
          </div>
        )}
      </body>
    </html>
  );
}
