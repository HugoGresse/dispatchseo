"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sidebar nav for /docs, in two shapes the layout mounts:
//   - "sidebar": the sticky left rail on lg+ screens
//   - "mobile":  a collapsed <details> panel above the content below lg
// Both read the same DOCS_NAV shape and share active-item logic - a page is
// active when its href matches the current pathname exactly (not prefix
// match, so /docs doesn't light up for every /docs/* page).

type Nav = {
  section: string;
  items: { slug: string; title: string; href?: string; external?: boolean }[];
}[];

function hrefFor(item: { slug: string; href?: string }) {
  if (item.href) return item.href;
  return item.slug ? `/docs/${item.slug}` : "/docs";
}

function NavList({ nav, pathname, onNavigate }: { nav: Nav; pathname: string; onNavigate?: () => void }) {
  return (
    <div className="space-y-6">
      {nav.map((section) => (
        <div key={section.section}>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
            {section.section}
          </p>
          <ul className="mt-2.5 space-y-0.5">
            {section.items.map((item) => {
              const href = hrefFor(item);
              // An off-docs entry (item.href) is never "the current page" -
              // /docs never renders it - so it skips the active treatment and
              // carries a small outbound arrow instead.
              const active = !item.href && pathname === href;
              const cls = `-ml-px flex items-center gap-1.5 rounded-md border-l-2 py-1.5 pl-3 pr-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 ${
                active
                  ? "border-violet-400 font-medium text-neutral-100"
                  : "border-transparent text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
              }`;
              // An external href (item.external) leaves the app entirely, or -
              // like /discord - redirects off it. Router navigation has nothing
              // to render at the other end, so those go out as a plain anchor
              // in a new tab and the docs page the reader was on stays put.
              const Tag = item.external ? "a" : Link;
              const linkProps = item.external
                ? ({ target: "_blank", rel: "noreferrer" } as const)
                : {};
              return (
                <li key={href}>
                  <Tag
                    href={href}
                    {...linkProps}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cls}
                  >
                    {item.title}
                    {item.href && (
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 16 16"
                        fill="none"
                        className="size-3 shrink-0 text-neutral-600"
                      >
                        <path
                          d="M6 3h7v7M13 3L4 12"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </Tag>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function DocsSidebar({ nav }: { nav: Nav }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Docs">
      <NavList nav={nav} pathname={pathname} />
    </nav>
  );
}

// Mobile: a closed-by-default panel, same jump-menu contract as the blog's
// inline "On this page" - not a live tracker, just fast access to every page
// without giving up a quarter of a narrow screen to a permanent sidebar.
export function DocsMobileNav({ nav, className = "" }: { nav: Nav; className?: string }) {
  const pathname = usePathname();
  const current = nav
    .flatMap((s) => s.items)
    .find((item) => !item.href && hrefFor(item) === pathname);

  return (
    <details className={`group rounded-xl bg-neutral-900 ${className}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium text-neutral-200 outline-none [&::-webkit-details-marker]:hidden focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950">
        <span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-500">Docs</span>
          {current && <span className="ml-2 text-neutral-100">{current.title}</span>}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          className="size-3.5 shrink-0 text-neutral-500 transition-transform duration-200 group-open:rotate-180"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <nav aria-label="Docs" className="border-t border-neutral-800 px-4 py-4">
        <NavList nav={nav} pathname={pathname} />
      </nav>
    </details>
  );
}
