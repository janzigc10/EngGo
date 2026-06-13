import { AppFrame } from "@/components/shell/app-frame";
import { WordbookManagementPanel } from "@/features/wordbook/wordbook-management-panel";

export default function WordbookPage() {
  return (
    <AppFrame>
      <WordbookManagementPanel />
    </AppFrame>
  );
}
