const secondaryAreas = ["收藏词单", "学习", "复习", "进度"];

export function AppNav() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-900">
        对话主舞台
      </span>
      {secondaryAreas.map((item) => (
        <span
          key={item}
          className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-slate-500"
        >
          {item}
        </span>
      ))}
    </div>
  );
}
