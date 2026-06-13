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
    <section className="rounded-[1.5rem] border border-[#e5e1d7] bg-white/95 p-5 shadow-sm">
      <div className="space-y-1">
        <h3 className="text-base font-extrabold text-[#151515]">学习设置</h3>
        <p className="text-sm text-[#6f6f68]">变更只影响下一轮 session。</p>
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
      <p className="text-sm font-semibold text-[#151515]">{label}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {targetOptions.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={`inline-flex min-h-9 min-w-12 items-center justify-center rounded-xl border px-3 text-sm font-extrabold transition focus:outline-none focus:ring-2 focus:ring-[#d08a18] focus:ring-offset-2 focus:ring-offset-[#f8f8f6] active:translate-y-px ${
              value === option
                ? "border-[#151515] bg-[#d08a18] text-[#151515]"
                : "border-[#dedacf] bg-white text-[#151515] hover:border-[#d08a18] hover:bg-[#fbfaf7]"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
