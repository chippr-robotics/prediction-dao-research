// Spec 086 — turn a member-chosen local image file into a small square data URL, entirely
// on-device (FR-006): validate → decode → cover-crop to 128px → re-encode. The original file
// never leaves the device; nothing here touches the network.

import { MAX_IMAGE_DATA_URL_LENGTH } from './accountProfilesStore'

export const PROFILE_IMAGE_SIZE = 128
// Generous input cap — the OUTPUT is what gets stored; this only refuses absurd picks early.
export const MAX_INPUT_FILE_BYTES = 10 * 1024 * 1024

/** Cheap pre-checks with stated reasons (FR-011). Returns null when acceptable. */
export function describeImageFileProblem(file) {
  if (!file) return 'Choose an image file.'
  if (!/^image\//.test(file.type || '')) return 'That file is not an image.'
  if (file.size > MAX_INPUT_FILE_BYTES) return 'That image is too large — pick one under 10 MB.'
  return null
}

/**
 * @param {File|Blob} file
 * @returns {Promise<string>} a `data:image/*` URL, ≤ MAX_IMAGE_DATA_URL_LENGTH
 * @throws {Error} with a member-readable message on any failure (FR-011)
 */
export async function processProfileImage(file) {
  const problem = describeImageFileProblem(file)
  if (problem) throw new Error(problem)

  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('That image could not be read.'))
      el.src = objectUrl
    })

    const side = PROFILE_IMAGE_SIZE
    const canvas = document.createElement('canvas')
    canvas.width = side
    canvas.height = side
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This browser cannot process images.')

    // Cover-crop: scale the short edge to the square, center the long one.
    const scale = Math.max(side / img.naturalWidth, side / img.naturalHeight)
    const w = img.naturalWidth * scale
    const h = img.naturalHeight * scale
    ctx.drawImage(img, (side - w) / 2, (side - h) / 2, w, h)

    // WebP first (smaller); browsers that can't encode it fall back to PNG output silently.
    let dataUrl = canvas.toDataURL('image/webp', 0.85)
    if (!dataUrl.startsWith('data:image/webp')) dataUrl = canvas.toDataURL('image/png')
    if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.7)
    }
    if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
      throw new Error('That image could not be shrunk enough — try a simpler one.')
    }
    return dataUrl
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
