import { createHash } from 'node:crypto'

import { DEMO_SEED, DEMO_UUID_NAMESPACE } from '@/lib/demo/constants'

function uuidBytes(uuid: string) {
  return Buffer.from(uuid.replaceAll('-', ''), 'hex')
}

export function deterministicDemoUuid(label: string) {
  const digest = createHash('sha1')
    .update(uuidBytes(DEMO_UUID_NAMESPACE))
    .update(`${DEMO_SEED}:${label}`, 'utf8')
    .digest()
    .subarray(0, 16)

  digest[6] = (digest[6]! & 0x0f) | 0x50
  digest[8] = (digest[8]! & 0x3f) | 0x80
  const value = digest.toString('hex')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}
