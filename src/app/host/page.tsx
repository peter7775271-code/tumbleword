import type { Metadata } from "next";
import { HostApp } from "@/components/host/HostApp";
import { GAME_NAME } from "@/lib/game/constants";

export const metadata: Metadata = { title: `Host · ${GAME_NAME}` };

export default function HostPage() {
  return <HostApp />;
}
