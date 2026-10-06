// A mesh gesture owns its native event; blank-space gestures belong to the camera.
const surfaceEvents = new WeakSet<Event>()
export function markSurfaceEvent(event: Event) { surfaceEvents.add(event) }
export function isSurfaceEvent(event: Event) { return surfaceEvents.has(event) }
