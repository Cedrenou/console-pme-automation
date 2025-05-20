import React from "react";
import "./globals.css";
export const metadata = {
  title: "Sunset Lambda Back Office",
  description: "Console d'administration PME Automation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
} 