"use client";

import {
  saveWordbookStudySettings,
} from "@/features/wordbook/wordbook-study-settings-store";
import type {
  StudySessionGoal,
  WordbookStudySettings,
} from "@/features/wordbook/wordbook-types";

const targetOptions: StudySessionGoal[] = [10, 20, 30];

type WordbookStudySettingsPanelProps = {
  settings: WordbookStudySettings;
};

export function WordbookStudySettingsPanel({
  settings,
}: WordbookStudySettingsPanelProps) {
  function saveSetting(
    key: keyof WordbookStudySettings,
    value: StudySessionGoal,
  ) {
    saveWordbookStudySettings({
      ...settings,
      [key]: value,
    });
  }

  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white/90 p-5 shadow-sm">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-slate-950">学习设置</h3>
        <p className="text-sm text-slate-500">变更只影响下一轮 session。</p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <TargetPicker
          label="Learn 每组"
          value={settings.learnTargetCount}
          onChange={(value) => saveSetting("learnTargetCount", value)}
        />
        <TargetPicker
          label="Review 每组"
          value={settings.reviewTargetCount}
          onChange={(value) => saveSetting("reviewTargetCount", value)}
        />
      </div>
    </section>
  );
}

function TargetPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: StudySessionGoal;
  onChange: (value: StudySessionGoal) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {targetOptions.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={`inline-flex h-9 min-w-12 items-center justify-center rounded-full border px-3 text-sm font-semibold transition ${
              value === option
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-sky-200 hover:bg-sky-50"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
