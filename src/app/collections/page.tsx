import { AppFrame } from "@/components/shell/app-frame";
import { CollectionsClient } from "@/app/collections/collections-client";

export default function CollectionsPage() {
  return (
    <AppFrame>
      <CollectionsClient />
    </AppFrame>
  );
}
