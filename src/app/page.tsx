import { AppFrame } from "@/components/shell/app-frame";
import { ChatWorkspace } from "@/components/chat/chat-workspace";

export default function Home() {
  return (
    <AppFrame>
      <ChatWorkspace />
    </AppFrame>
  );
}
