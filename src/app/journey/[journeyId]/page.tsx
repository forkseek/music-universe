import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { PortalLink as Link } from "@/components/home/SceneTransition";
import { findUser, SESSION_COOKIE } from "@/lib/server/session";
import { readJourney, listJourneys } from "@/lib/music/journeys";
import { readWorld } from "@/lib/music/worlds";
import { readLibrary } from "@/lib/music/library";
import { toWorldTrack } from "@/lib/music/present";
import { MusicWorld } from "@/components/world/MusicWorld";
import { RequestError } from "@/lib/server/errors";
import { SceneBackdrop } from "@/components/home/SceneBackdrop";

export const runtime = "nodejs";
export default async function JourneyPage({ params }: { params: Promise<{ journeyId: string }> }) {
  const userId = findUser((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId) notFound();
  const { journeyId } = await params;
  let journey;
  try { journey = readJourney(userId, journeyId); } catch (error) { if (error instanceof RequestError && error.status === 404) notFound(); throw error; }
  const world = readWorld(userId, journey.worldId);
  const library = readLibrary(userId, world.scope);
  return <><SceneBackdrop scene="journey" /><main className="world-stage-page" tabIndex={-1} data-scene-focus><header className="site-header world-stage-header"><Link href="/#hall" className="brand" label="音乐大厅">◎ Music World</Link><span className="mw-world-header-caption">ONE SONG LEADS TO ANOTHER</span><div className="mw-journey-return"><Link href={`/world/${world.id}`} label="音乐地图">← 返回音乐世界</Link><Link href="/#hall" label="音乐大厅">回到音乐大厅 ↶</Link></div></header>
    <section className="import-panel library-panel world-shell"><div className="world-shell-heading"><div><p className="eyebrow muted">{world.scope === "demo" ? "DEMO MUSIC LIBRARY" : "YOUR MUSIC WORLD"} / 06 · JOURNEY</p><h1 className="world-title">{journey.title}</h1></div><p className="mw-world-invitation">循着光，<span>去往下一站。</span></p></div>
      <MusicWorld world={world} tracks={library.tracks.map(toWorldTrack)} savedJourneys={listJourneys(userId, world.id)} initialJourney={journey} /></section></main></>;
}
