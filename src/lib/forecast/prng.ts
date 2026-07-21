export type RandomSource = () => number

function mix(value: number) {
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad)
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97)
  return (value ^ (value >>> 15)) >>> 0
}

export function hashStream(seed: number, ...parts: Array<string | number>) {
  let hash = mix(seed | 0)
  for (const part of parts) {
    const value = String(part)
    for (let index = 0; index < value.length; index++) {
      hash = Math.imul(hash ^ value.charCodeAt(index), 16_777_619) >>> 0
    }
    hash = mix(hash)
  }
  return hash
}

export function createSeededRandom(
  seed: number,
  ...stream: Array<string | number>
): RandomSource {
  let state = hashStream(seed, ...stream)
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}
