const SAFE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'])

/**
 * Smart Coach photos live at `<userId>/ai-chat/<stamp>.<ext>`.
 * The second folder is not a coach conversation id. Storage insert policy
 * must allow that folder for the signed-in user.
 */
export function aiCoachImageStoragePath(userId: string, fileName: string, now = Date.now()): string {
  const id = userId.trim()
  if (!id || id.includes('/') || id.includes('..')) {
    throw new Error('Invalid account')
  }
  const ext = (fileName.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const safeExt = SAFE_EXT.has(ext) ? ext : 'jpg'
  return `${id}/ai-chat/${now}.${safeExt}`
}
