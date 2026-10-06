import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { PortalLink as Link } from "@/components/home/SceneTransition";
import { findUser, SESSION_COOKIE } from "@/lib/server/session";
import { readWorld } from "@/lib/music/worlds";
import { RequestError } from "@/lib/server/errors";
import { MusicWorld } from "@/components/world/MusicWorld";
import { readLibrary } from "@/lib/music/library";
import { toWorldTrack } from "@/lib/music/present";
import { listJourneys } from "@/lib/music/journeys";
import { SceneBackdrop } from "@/components/home/SceneBackdrop";

export const runtime = "nodejs";
export default async function WorldPage({ params, searchParams }: { params: Promise<{ worldId: string }>; searchParams: Promise<{ view?: string | string[] }> }) {
  const userId = findUser((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId) notFound();
  const { worldId } = await params;
  let world;
  try { world = readWorld(userId, worldId); } catch (error) { if (error instanceof RequestError && error.status === 404) notFound(); throw error; }
  const library = readLibrary(userId, world.scope);
  const savedJourneys = listJourneys(userId, world.id);
  const requestedView = (await searchParams).view;
  const entryView = requestedView === "journey" || requestedView === "guide" ? requestedView : "map";
  return <><SceneBackdrop scene={entryView === "journey" ? "journey" : "world"} /><main className="world-stage-page" tabIndex={-1} data-scene-focus><header className="site-header world-stage-header"><Link href="/#hall" className="brand" label="音乐大厅">◎ Music World</Link><span className="mw-world-header-caption">FOLLOW THE CONNECTIONS</span><Link href="/#hall" label="音乐大厅">← 回到音乐大厅</Link></header><section className="import-panel library-panel world-shell"><div className="world-shell-heading"><div><p className="eyebrow muted">{world.scope === "demo" ? "DEMO MUSIC LIBRARY" : "YOUR MUSIC WORLD"} / 05</p><h1 className="world-title">{world.name}</h1></div><p className="mw-world-invitation">选一首歌，<span>让旅程发生。</span></p></div><MusicWorld world={world} tracks={library.tracks.map(toWorldTrack)} savedJourneys={savedJourneys} entryView={entryView} /></section></main></>;
}
