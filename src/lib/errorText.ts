import { ConvexError } from "convex/values"

/**
 * The plain-words part of an error, for a toast or an inline message.
 * Convex wraps server errors as "[CONVEX M(...)] [Request ID: ...] Server Error
 * Uncaught Error: <message> at handler (...)". People should only ever see
 * <message>, or the fallback when there is nothing readable.
 */
export function errorText(err: unknown, fallback = "That did not work. Try again."): string {
  if (err instanceof ConvexError) {
    const data: unknown = err.data
    if (typeof data === "string" && data.trim()) return data.trim()
    if (data && typeof data === "object" && "message" in data && typeof data.message === "string" && data.message.trim()) {
      return data.message.trim()
    }
  }
  if (err instanceof Error) {
    const m = /Uncaught (?:Convex)?Error: (.*?)(?:\n|\s+at\s|$)/s.exec(err.message)
    if (m?.[1]?.trim()) return m[1].trim()
    if (/\[Request ID|Server Error|\[CONVEX /i.test(err.message)) return fallback
    return err.message.trim() || fallback
  }
  return fallback
}
