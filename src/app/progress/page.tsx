import { AppFrame } from "@/components/shell/app-frame";
import { ProgressClient } from "@/app/progress/progress-client";

export default function ProgressPage() {
  return (
    <AppFrame>
      <ProgressClient />
    </AppFrame>
  );
}
