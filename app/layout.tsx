// The root layout (#26). The shell holds the client state, so it stays mounted when the KAM moves between pages.
// The assistant (#34) sits inside the shell, so it reads the same state and keeps its answer across pages.

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Assistant } from "./assistant/assistant.tsx";
import "./globals.css";
import { lookScript } from "./look.ts";
import { Shell } from "./shell.tsx";

export const metadata: Metadata = { title: "ValueLens by Lindström" };

export default function RootLayout({ children }: { children: ReactNode }) {
  // The head script sets the saved theme and colours on <html> before the first paint (#33). The server cannot know
  // them, so <html> may differ from the server render, and suppressHydrationWarning allows that.
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: lookScript() }} />
      </head>
      <body>
        <Shell>
          {children}
          <Assistant />
        </Shell>
      </body>
    </html>
  );
}
