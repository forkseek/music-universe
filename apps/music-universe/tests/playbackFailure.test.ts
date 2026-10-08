import { test } from 'node:test'
import assert from 'node:assert/strict'
import { playbackFailure } from '../src/lib/playbackFailure'

test('denied autoplay keeps the source ready for a direct user click', () => {
  const failure = playbackFailure(new DOMException('blocked by user gesture', 'NotAllowedError'))
  assert.equal(failure.status, 'paused')
  assert.equal(failure.blocked, true)
  assert.match(failure.message, /再点击一次播放/)
})
test('a native network or decode error cannot be hidden by a rejected play promise', () => {
  const rejection = new DOMException('could not play', 'NotAllowedError')
  for (const [code, expected] of [[2, /下载中断/], [3, /无法解码/], [4, /地址不可用/]] as const) {
    const failure = playbackFailure(rejection, code)
    assert.equal(failure.status, 'error')
    assert.equal(failure.blocked, false)
    assert.match(failure.message, expected)
  }
})
test('unsupported sources expose the format/address error rather than autoplay instructions', () => {
  const failure = playbackFailure(new DOMException('unsupported', 'NotSupportedError'))
  assert.equal(failure.status, 'error')
  assert.equal(failure.blocked, false)
  assert.match(failure.message, /浏览器不支持/)
})
test('an unknown failure stays retryable without claiming that audio is playing', () => {
  const failure = playbackFailure(new Error('temporary failure'))
  assert.equal(failure.status, 'paused')
  assert.equal(failure.blocked, false)
  assert.match(failure.message, /重试/)
})
