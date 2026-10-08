import type { Album } from '../lib/generateAlbumGalaxy'
import { universeAsset } from '../lib/deployment'

// Metadata / cover: Apple Music and the public iTunes lookup API, checked 2026-10-04.
export const DEFAULT_ALBUM: Album = {
  id: 'dont-tap-the-glass',
  name: "DON'T TAP THE GLASS",
  artist: 'Tyler, The Creator',
  cover: universeAsset('covers/dont-tap-the-glass.jpg'),
  year: 2025,
  tracks: [
    { id: 'dtg-01', title: 'Big Poe', duration: 182 },
    { id: 'dtg-02', title: 'Sugar on My Tongue', duration: 153 },
    { id: 'dtg-03', title: 'Sucka Free', duration: 161 },
    { id: 'dtg-04', title: 'Mommanem', duration: 75 },
    { id: 'dtg-05', title: 'Stop Playing With Me', duration: 133 },
    { id: 'dtg-06', title: 'Ring Ring Ring', duration: 202 },
    { id: 'dtg-07', title: "Don't Tap That Glass / Tweakin'", duration: 222 },
    { id: 'dtg-08', title: "Don't You Worry Baby", duration: 178 },
    { id: 'dtg-09', title: "I'll Take Care of You", duration: 201 },
    { id: 'dtg-10', title: 'Tell Me What It Is', duration: 202 },
  ],
}

export function formatDuration(seconds?: number) {
  if (seconds === undefined) return '—'
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
