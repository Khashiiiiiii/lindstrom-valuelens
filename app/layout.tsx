// The root layout (#26). The shell holds the client state, so it stays mounted when the KAM moves between pages.
// The assistant (#34) sits inside the shell, so it reads the same state and keeps its answer across pages.

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Assistant } from "./assistant/assistant.tsx";
import "./globals.css";
import { Shell } from "./shell.tsx";

export const metadata: Metadata = { title: "ValueLens by Lindström" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>
          {children}
          <Assistant />
        </Shell>
      </body>
    </html>
  );
}
