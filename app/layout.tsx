// The root layout (#26). The shell holds the client state, so it stays mounted when the KAM moves between pages.

import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { Shell } from "./shell.tsx";

export const metadata: Metadata = { title: "ValueLens by Lindström" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
