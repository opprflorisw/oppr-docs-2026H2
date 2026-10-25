// Browser side of adding a picture to the image library: hash, probe size,
// upload the bytes, register the row (de-duplicated on SHA-256 server-side).
import type { ReactMutation } from "convex/react"
import type { Id } from "../../../convex/_generated/dataModel"
import { api } from "../../../convex/_generated/api"

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/gif,image/webp"

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buf)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export async function probeDimensions(file: File): Promise<{ width: number; height: number } | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error("Could not read the image size"))
      img.src = url
    })
    return { width: img.naturalWidth, height: img.naturalHeight }
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Readable reason a file cannot be added, or null when it is fine. */
export function checkImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return `${file.name} is not an image.`
  if (file.size > MAX_IMAGE_BYTES) {
    return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB.`
  }
  return null
}

/** "mixer-lid_open.jpg" -> "Mixer lid open", a starting alt text the AI refines. */
export function altFromFilename(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_.]+/g, " ").trim()
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Image"
}

type GenerateUploadUrl = ReactMutation<typeof api.files.generateUploadUrl>
type CreateFromUpload = ReactMutation<typeof api.images.createFromUpload>

/** Uploads the raw bytes and returns the storage id (for search by photo). */
export async function uploadBlob(generateUploadUrl: GenerateUploadUrl, file: Blob): Promise<Id<"_storage">> {
  const uploadUrl = await generateUploadUrl({})
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  })
  if (!res.ok) throw new Error(`Upload failed (${res.status})`)
  const { storageId } = (await res.json()) as { storageId: Id<"_storage"> }
  return storageId
}

export async function uploadImageFile(
  file: File,
  deps: { generateUploadUrl: GenerateUploadUrl; createFromUpload: CreateFromUpload },
  meta: { altText?: string; assetIds?: Id<"assets">[]; areaCodes?: string[] } = {},
): Promise<{ id: Id<"images">; url: string | null; deduped: boolean; altText: string }> {
  const problem = checkImageFile(file)
  if (problem) throw new Error(problem)
  const buf = await file.arrayBuffer()
  const [sha256, dims] = await Promise.all([sha256Hex(buf), probeDimensions(file)])
  const storageId = await uploadBlob(deps.generateUploadUrl, file)
  const altText = meta.altText?.trim() || altFromFilename(file.name)
  const result = await deps.createFromUpload({
    storageId,
    filename: file.name,
    contentType: file.type,
    byteSize: file.size,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    sha256,
    altText,
    ...(meta.assetIds?.length ? { assetIds: meta.assetIds } : {}),
    ...(meta.areaCodes?.length ? { areaCodes: meta.areaCodes } : {}),
  })
  return { id: result.id, url: result.url, deduped: result.deduped, altText }
}
