"use client";
import React from "react";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import PageLoader from "@/components/PageLoader";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-gray-100">
        <PageLoader />
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
} 