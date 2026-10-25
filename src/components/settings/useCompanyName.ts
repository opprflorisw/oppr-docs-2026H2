import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"

/**
 * The company name from Settings, Company (coverSettings.companyName, the one
 * source). Null until one is set or while it loads.
 */
export function useCompanyName(): string | null {
  return useQuery(api.coverSettings.company)?.name ?? null
}
