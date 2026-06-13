import { redirect } from "next/navigation";

import { AppFrame } from "@/components/shell/app-frame";
import { TodayEntry } from "@/app/today/today-entry";

type HomeProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const hasChatDraft = Boolean(params?.draft || params?.examTarget);

  if (hasChatDraft) {
    const query = new URLSearchParams();

    Object.entries(params ?? {}).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item) => query.append(key, item));
        return;
      }

      if (value !== undefined) {
        query.set(key, value);
      }
    });

    redirect(`/chat?${query.toString()}`);
  }

  return (
    <AppFrame>
      <TodayEntry />
    </AppFrame>
  );
}
