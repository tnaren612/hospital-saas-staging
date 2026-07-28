import type { Metadata } from "next";
import { MeetingRoom } from "@/components/video/meeting-room";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Video Meeting",
  description: "Demo video consultation meeting room.",
  path: "/video-consult/meeting",
  noIndex: true,
});

export default function MeetingPage() {
  return <MeetingRoom />;
}
