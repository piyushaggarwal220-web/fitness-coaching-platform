/**
 * Deterministic reframe — center crop only unless a real provider does more.
 */

import type { CapabilityFlag } from '@/lib/jarvis/video/editor/types'

export function centerCropReframe(): {
  strategy: 'center_crop'
  capability: CapabilityFlag
  note: string
} {
  return {
    strategy: 'center_crop',
    capability: 'SUPPORTED',
    note: 'Center crop / cover fit to 9:16. Face/person tracking unsupported.',
  }
}

export function smartFaceReframeCapability(): {
  capability: CapabilityFlag
  note: string
} {
  return {
    capability: 'UNSUPPORTED',
    note: 'Smart face/person tracking reframe is not available in Phase 6.',
  }
}
