// The page template (#33). Next remounts a template on every navigation, so the page fades in when the page
// changes. The shell and the assistant sit in the layout, outside it, so they keep their state.

import type { ReactNode } from "react";

export default function Template({ children }: { children: ReactNode }) {
  return <div className="page">{children}</div>;
}
