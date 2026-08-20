import { Link } from "@tanstack/react-router";

const links = [
  { to: "/", label: "Run agent" },
  { to: "/results", label: "Agent results" },
  { to: "/admin", label: "Job index" },
  { to: "/eval", label: "Agent evaluation" },
] as const;

export function AppSidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-sidebar px-5 py-8 md:block">
      <div className="mb-10">
        <p className="text-sm font-semibold tracking-tight text-foreground">TalentBridge</p>
        <p className="mt-1 text-xs text-muted-foreground">AI career agent · Lebanon</p>
      </div>
      <nav className="flex flex-col gap-1">
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            activeOptions={{ exact: link.to === "/" }}
            className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            activeProps={{ className: "bg-accent text-accent-foreground font-medium" }}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

export function MobileNav() {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border px-4 py-3 md:hidden">
      {links.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          activeOptions={{ exact: link.to === "/" }}
          className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground"
          activeProps={{ className: "bg-accent text-accent-foreground font-medium" }}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}