import { AppFrame } from "@/components/shell/app-frame";
import { ReviewClient } from "@/app/review/review-client";

export default function ReviewPage() {
  return (
    <AppFrame>
      <ReviewClient />
    </AppFrame>
  );
}
