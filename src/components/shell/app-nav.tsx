import Link from "next/link";

const secondaryAreas = [
  { href: "/collections", label: "收藏" },
  { href: "/learn", label: "学习" },
  { href: "/review", label: "复习" },
];

export function AppNav() {
  return (
    <nav
      aria-label="EngGo secondary navigation"
      className="flex flex-wrap items-center gap-3 text-sm text-slate-600"
    >
      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-900">
        对话主舞台
      </span>
      {secondaryAreas.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-slate-500 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
