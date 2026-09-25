"use client";

import { useParams } from "next/navigation";
import ChatView from "@/components/chat/ChatView";

export default function ChatSessionPage() {
  const { id } = useParams<{ id: string }>();
  return <ChatView sessionId={Number(id)} />;
}
