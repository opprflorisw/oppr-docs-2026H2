import { useCallback, useEffect, useRef, useState } from "react"

export interface VoiceClip {
  blob: Blob
  mimeType: string
  durationMs: number
}

type RecorderState = "idle" | "starting" | "recording"

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return ""
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
    if (MediaRecorder.isTypeSupported(t)) return t
  }
  return ""
}

/**
 * Voice notes with MediaRecorder. `start()` asks for the microphone and
 * records; `stop()` resolves with the clip (or null when it was too short or
 * cancelled). `level` is 0..1 for a live meter.
 */
export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>("idle")
  const [level, setLevel] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const recRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const resolveRef = useRef<((c: VoiceClip | null) => void) | null>(null)
  const cancelRef = useRef(false)
  const wantStopRef = useRef(false)

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    void ctxRef.current?.close().catch(() => {})
    ctxRef.current = null
    recRef.current = null
    setLevel(0)
  }, [])

  useEffect(() => () => {
    cancelRef.current = true
    try {
      recRef.current?.stop()
    } catch {
      // already stopped
    }
    cleanup()
  }, [cleanup])

  const supported =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia

  const start = useCallback(async () => {
    if (state !== "idle") return
    setError(null)
    if (!supported) {
      setError("This browser cannot record voice notes. Type a note instead.")
      return
    }
    setState("starting")
    cancelRef.current = false
    wantStopRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = pickMime()
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        const durationMs = Date.now() - startedRef.current
        const type = rec.mimeType || mimeType || "audio/webm"
        const blob = new Blob(chunksRef.current, { type })
        cleanup()
        setState("idle")
        setElapsed(0)
        const resolve = resolveRef.current
        resolveRef.current = null
        if (cancelRef.current || durationMs < 600 || blob.size === 0) resolve?.(null)
        else resolve?.({ blob, mimeType: type.split(";")[0]!, durationMs })
      }

      // Live level meter.
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (Ctx) {
          const ctx = new Ctx()
          ctxRef.current = ctx
          const src = ctx.createMediaStreamSource(stream)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 512
          src.connect(analyser)
          const data = new Uint8Array(analyser.fftSize)
          const tick = () => {
            analyser.getByteTimeDomainData(data)
            let sum = 0
            for (let i = 0; i < data.length; i++) {
              const v = (data[i]! - 128) / 128
              sum += v * v
            }
            setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4))
            setElapsed(Date.now() - startedRef.current)
            rafRef.current = requestAnimationFrame(tick)
          }
          rafRef.current = requestAnimationFrame(tick)
        }
      } catch {
        // No meter: recording still works.
      }

      startedRef.current = Date.now()
      rec.start(250)
      setState("recording")
      // Released before the microphone was ready: stop right away.
      if (wantStopRef.current) rec.stop()
    } catch (err) {
      cleanup()
      setState("idle")
      const name = err instanceof DOMException ? err.name : ""
      setError(
        name === "NotAllowedError"
          ? "The microphone is blocked. Allow it in the browser settings, or type a note."
          : "The microphone could not start. Type a note instead.",
      )
    }
  }, [state, supported, cleanup])

  /** Stops and resolves with the clip. */
  const stop = useCallback((): Promise<VoiceClip | null> => {
    return new Promise((resolve) => {
      const rec = recRef.current
      if (!rec || rec.state === "inactive") {
        wantStopRef.current = true
        resolve(null)
        return
      }
      resolveRef.current = resolve
      rec.stop()
    })
  }, [])

  const cancel = useCallback(() => {
    cancelRef.current = true
    wantStopRef.current = true
    const rec = recRef.current
    if (rec && rec.state !== "inactive") rec.stop()
  }, [])

  return { state, level, elapsed, error, supported, start, stop, cancel, clearError: () => setError(null) }
}
