import type { Tour } from "../types"
import { START_TOURS } from "./start"
import { DOCUMENTS_TOURS } from "./documents"
import { LEARN_TOURS } from "./learn"
import { WIKI_TOURS } from "./wiki"
import { PLANT_TOURS } from "./plant"
import { SETTINGS_TOURS } from "./settings"
import { DEVELOPER_TOURS } from "./developer"

export const TOURS: Tour[] = [
  ...START_TOURS,
  ...DOCUMENTS_TOURS,
  ...LEARN_TOURS,
  ...WIKI_TOURS,
  ...PLANT_TOURS,
  ...SETTINGS_TOURS,
  ...DEVELOPER_TOURS,
]

export function findTour(id: string): Tour | undefined {
  return TOURS.find((t) => t.id === id)
}
