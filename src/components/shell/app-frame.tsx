"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

type AppFrameProps = {
  children: ReactNode;
};

const drawerItems = [
  { href: "/", label: "Today", match: (pathname: string) => pathname === "/" || pathname === "/today" },
  { href: "/learn", label: "Learn", match: (pathname: string) => pathname.startsWith("/learn") },
  { href: "/review", label: "Review", match: (pathname: string) => pathname.startsWith("/review") },
  { href: "/chat", label: "Chat", match: (pathname: string) => pathname.startsWith("/chat") },
];

function getPageTitle(pathname: string) {
  if (pathname === "/" || pathname === "/today") {
    return "Today";
  }

  if (pathname.startsWith("/learn")) {
    return "Learn";
  }

  if (pathname.startsWith("/review")) {
    return "Review";
  }

  if (pathname.startsWith("/chat")) {
    return "Chat";
  }

  if (pathname.startsWith("/wordbook")) {
    return "Wordbook";
  }

  if (pathname.startsWith("/collections")) {
    return "Collections";
  }

  if (pathname.startsWith("/progress")) {
    return "Progress";
  }

  return "EngGo";
}

export function AppFrame({ children }: AppFrameProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const firstDrawerLinkRef = useRef<HTMLAnchorElement>(null);
  const pageTitle = getPageTitle(pathname);

  function closeDrawer() {
    setDrawerOpen(false);
    window.requestAnimationFrame(() => {
      menuButtonRef.current?.focus();
    });
  }

  function handleDrawerKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") {
      return;
    }

    const focusable = drawerRef.current
      ? Array.from(
          drawerRef.current.querySelectorAll<HTMLElement>(
            "a[href], button:not([disabled])",
          ),
        )
      : [];

    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    firstDrawerLinkRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeDrawer();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-[100dvh] bg-[#f8f8f6] text-[#151515]">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col px-4 pb-24 pt-4 sm:px-6 lg:px-8">
        <header className="sticky top-0 z-30 -mx-4 border-b border-[#e5e1d7] bg-white/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-3">
            <button
              ref={menuButtonRef}
              type="button"
              aria-label="打开主导航"
              aria-expanded={drawerOpen}
              aria-controls="enggo-navigation-drawer"
              onClick={() => setDrawerOpen(true)}
              className="flex h-10 w-10 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-[#dedacf] bg-white text-[#151515] shadow-sm transition hover:border-[#d08a18] hover:bg-[#fbfaf7] active:translate-y-px"
            >
              <span className="h-0.5 w-4 rounded-full bg-current" />
              <span className="h-0.5 w-4 rounded-full bg-current" />
              <span className="h-0.5 w-4 rounded-full bg-current" />
            </button>
            <div className="min-w-0">
              <p className="text-sm font-extrabold leading-none text-[#151515]">
                {pageTitle}
              </p>
              <p className="mt-1 hidden text-xs font-medium text-[#6f6f68] sm:block">
                EngGo exam study workspace
              </p>
            </div>
          </div>
        </header>

        <main className="flex flex-1 py-6 sm:py-8">{children}</main>

        <Link
          href="/wordbook"
          aria-label="打开词书"
          title="词书"
          className="fixed bottom-3 right-[calc(0.5rem-(100vw-100%))] z-30 flex h-11 w-11 items-center justify-center rounded-xl border border-[#151515] bg-[#151515] text-white shadow-[0_12px_28px_rgba(21,21,21,0.18)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#d08a18] focus:ring-offset-2 focus:ring-offset-[#f8f8f6] active:translate-y-px sm:bottom-5 sm:left-1/2 sm:right-auto sm:h-14 sm:w-14 sm:-translate-x-1/2 sm:rounded-2xl sm:hover:-translate-x-1/2"
        >
          <span aria-hidden="true" className="relative block h-6 w-5 rounded-r-md rounded-l-sm border-2 border-white">
            <span className="absolute -bottom-0.5 -top-0.5 left-1.5 w-0.5 bg-white/75" />
            <span className="absolute left-3 right-1 top-2 h-0.5 bg-white" />
            <span className="absolute left-3 right-1 top-4 h-0.5 bg-white/75" />
          </span>
        </Link>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40" role="presentation">
          <button
            type="button"
            aria-label="关闭主导航"
            className="absolute inset-0 bg-[#151515]/25"
            onClick={closeDrawer}
          />
          <nav
            ref={drawerRef}
            id="enggo-navigation-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="enggo-navigation-title"
            onKeyDown={handleDrawerKeyDown}
            className="absolute bottom-0 left-0 top-0 flex w-72 max-w-[82vw] flex-col gap-3 bg-[#151515] px-4 py-5 text-white shadow-[14px_0_34px_rgba(21,21,21,0.24)]"
          >
            <div className="mb-2 flex items-start justify-between gap-3 px-2">
              <div>
                <p id="enggo-navigation-title" className="text-sm font-extrabold tracking-[0.08em]">ENGGO</p>
                <p className="mt-1 text-xs text-white/55">Exam OS</p>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="rounded-lg border border-white/15 px-2 py-1 text-xs font-bold text-white/75 transition hover:border-white/30 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#d08a18]"
              >
                关闭
              </button>
            </div>
            {drawerItems.map((item, index) => {
              const active = item.match(pathname);

              return (
                <Link
                  key={item.href}
                  ref={index === 0 ? firstDrawerLinkRef : undefined}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={closeDrawer}
                  className={`rounded-xl border px-4 py-3 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-[#d08a18] ${
                    active
                      ? "border-[#d08a18] bg-[#d08a18] text-[#151515]"
                      : "border-white/12 bg-white/[0.08] text-white hover:border-white/24 hover:bg-white/[0.12]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      ) : null}
    </div>
  );
}
