import Link from "next/link";
import { Logo } from "@/components/ui";

const linkClass =
  "flex flex-col items-center gap-2 rounded-3xl px-8 py-8 text-center font-black outline-none transition focus-visible:ring-4 focus-visible:ring-sky focus-visible:ring-offset-4 focus-visible:ring-offset-ink-950";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-10 px-6 py-12">
      <Logo className="text-[8vw] md:text-6xl" />
      <p className="max-w-xl text-center text-xl text-ink-300">
        Find words on a shared board, on your phone. Words anyone else also found are wiped out, so the weird ones win.
      </p>
      <div className="grid w-full gap-5 sm:grid-cols-2">
        <Link href="/host" className={`${linkClass} bg-ink-800 ring-1 ring-white/10`}>
          <span className="text-5xl">📺</span>
          <span className="text-3xl">Host a game</span>
          <span className="text-base font-bold text-ink-300">Open this on the TV or laptop everyone can see</span>
        </Link>
        <Link href="/play" className={`${linkClass} bg-amber text-ink-950`}>
          <span className="text-5xl">📱</span>
          <span className="text-3xl">Join a game</span>
          <span className="text-base font-bold text-ink-950/70">Enter the room code on your phone</span>
        </Link>
      </div>
      <p className="text-sm text-ink-500">2 to 8 players · 3 rounds · 90 seconds each</p>
    </main>
  );
}
