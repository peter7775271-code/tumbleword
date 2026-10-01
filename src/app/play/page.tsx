import type { Metadata } from "next";
import { PlayerApp } from "@/components/play/PlayerApp";
import { GAME_NAME } from "@/lib/game/constants";

export const metadata: Metadata = { title: `Join · ${GAME_NAME}` };

export default async function PlayPage({ searchParams }: PageProps<"/play">) {
  const { code } = await searchParams;
  const initialCode = (typeof code === "string" ? code : "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  return <PlayerApp initialCode={initialCode} />;
}
