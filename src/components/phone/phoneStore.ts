import { useSyncExternalStore } from "react"
import { memoryLocation } from "wouter/memory-location"

// The phone preview lives outside any page, so its state does too: whether
// it is open, and where the phone app is. Both survive page changes and a
// reload within the tab (sessionStorage).

export type PhoneMode = "closed" | "popup" | "docked"

/** Width of the docked phone. Ask docks to its left (AskDock). */
export const PHONE_DOCK_W = 440

const MODE_KEY = "oppr.phone.mode"
const PATH_KEY = "oppr.phone.path"
const EVENT = "oppr-phone"

function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function writeSession(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    // Storage blocked: the phone just forgets on reload.
  }
}

function readMode(): PhoneMode {
  const m = readSession(MODE_KEY)
  return m === "popup" || m === "docked" ? m : "closed"
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange)
  return () => window.removeEventListener(EVENT, onChange)
}

export function setPhoneMode(mode: PhoneMode) {
  writeSession(MODE_KEY, mode)
  window.dispatchEvent(new Event(EVENT))
}

export function usePhoneMode(): PhoneMode {
  return useSyncExternalStore(subscribe, readMode, () => "closed")
}

const saved = readSession(PATH_KEY)
let lastPath = saved?.startsWith("/m") ? saved : "/m"

/** The phone's own address bar. One per browser tab. */
export const phoneLocation = memoryLocation({ path: lastPath })

/** Where the phone app is now. */
export function phonePath(): string {
  return lastPath
}

export function rememberPhonePath(path: string) {
  lastPath = path
  writeSession(PATH_KEY, path)
}
