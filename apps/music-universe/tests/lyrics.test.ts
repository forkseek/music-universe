import test from 'node:test'
import assert from 'node:assert/strict'
import { LYRIC_LIMITS, lyricIndexAt, parseLrc } from '../src/lib/lyrics'

test('LRC parses offsets, fractional seconds, repeated timestamps and sorts source order', () => {
  assert.deepEqual(parseLrc('\uFEFF[ar:Test]\r\n[offset:-500]\n[00:03.45][00:01.2]Repeat\n[00:00.100]First'), [
    { time: 0, text: 'First' }, { time: .7, text: 'Repeat' }, { time: 2.95, text: 'Repeat' },
  ])
})
test('equal timestamps merge translation once and timed blanks clear lyrics during instrumental gaps', () => {
  assert.deepEqual(parseLrc('[00:01.000]Hello\n[00:01.000]Hello\n[00:01.000]你好\n[00:03.000]'), [
    { time: 1, text: 'Hello\n你好' }, { time: 3, text: '' },
  ])
})
test('binary lookup has no stale future lyric on backwards seeks or before first timestamp', () => {
  const lines = parseLrc('[00:02]First\n[00:10]Second\n[00:20]Third')
  assert.deepEqual([0, 2, 10, 99, 2.1, -5, NaN].map(time => lyricIndexAt(lines, time)), [-1, 0, 1, 2, 0, -1, -1])
  assert.equal(lyricIndexAt([], 4), -1)
})
test('untimed text and invalid seconds never become invented timed lyrics', () => {
  assert.deepEqual(parseLrc('[ti:Title]\nJust plain text\n[01:99]Bad timestamp'), [])
  assert.equal(parseLrc('[00:01]<00:01.20>word <00:01.60>word')[0].text, 'word word')
  assert.equal(parseLrc('[00:01]<img src=x onerror=evil()>')[0].text, '<img src=x onerror=evil()>') // rendered as text, never HTML
})
test('bounds apply to UTF-8 bytes and timestamp expansion', () => {
  assert.throws(() => parseLrc('中'.repeat(180_000)), /512 KB/)
  assert.throws(() => parseLrc('[00:01]'.repeat(LYRIC_LIMITS.lines + 1) + 'x'), /2000/)
  assert.equal(parseLrc('[00:00]' + 'x'.repeat(1000))[0].text.length, LYRIC_LIMITS.textLength)
})
