import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createJsonStore } from '../src/lib/json'

function memory() {
  const values = new Map<string, string>(); let writes = 0
  return { storage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { writes++; values.set(key, value) } } as Storage, values, writes: () => writes }
}
const valid = (value: unknown): value is { id: string } => !!value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string'
test('JSON storage rejects corrupted, wrong-shaped and oversized data without breaking startup', () => {
  const m = memory(), store = createJsonStore(() => m.storage, 'album', valid, 60), fallback = { id: 'default' }
  for (const raw of ['{broken', 'null', '[]', '{"name":"wrong"}', JSON.stringify({ id: 'x'.repeat(100) })]) { m.values.set('album', raw); assert.deepEqual(store.read(fallback), fallback) }
})
test('JSON storage reuses validated data, skips duplicate writes, and observes external storage changes', () => {
  const m = memory(); let checks = 0
  const store = createJsonStore(() => m.storage, 'album', (value): value is { id: string } => { checks++; return valid(value) })
  assert.ok(store.write({ id: 'one' })); assert.ok(store.write({ id: 'one' })); assert.equal(m.writes(), 1)
  const before = checks; store.read({ id: 'default' }); store.read({ id: 'default' }); assert.equal(checks, before)
  m.values.set('album', '{"id":"two"}'); assert.equal(store.read({ id: 'default' }).id, 'two')
})
test('JSON storage failure preserves the last valid value and prevents invalid/oversized writes', () => {
  const m = memory(), store = createJsonStore(() => m.storage, 'album', valid, 40)
  store.write({ id: 'valid' }); const raw = m.values.get('album')
  assert.equal(store.write({ id: 'x'.repeat(100) }), false); assert.equal(m.values.get('album'), raw)
  const privateStore = createJsonStore<{ id: string }>(() => { throw new Error('storage unavailable') }, 'key', valid)
  assert.equal(privateStore.write({ id: 'safe' }), false); assert.deepEqual(privateStore.read({ id: 'default' }), { id: 'default' })
})
