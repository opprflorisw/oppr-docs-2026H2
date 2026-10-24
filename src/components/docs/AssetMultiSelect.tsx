// AssetMultiSelect
//
// Searchable multi-select bound to the asset registry. Selected assets are
// chips above a popover trigger; the popover hosts a cmdk-driven list with
// two groups:
//   • Recently linked  — last 8 assets the author has linked across any doc
//                         (localStorage-backed via useRecentlyLinkedAssets).
//   • By location      — remaining assets grouped by their `location` field
//                         so authors can scan a hall/line at a glance.
//
// Each row shows pin badge + code + name + location truncate.

import { useMemo, useState } from "react"
import { Check, ChevronsUpDown, MapPin, X } from "lucide-react"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { toLegacyAsset } from "@/lib/convex-adapters"
import type { Asset } from "@/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useRecentlyLinkedAssets } from "./useRecentlyLinkedAssets"

interface AssetMultiSelectProps {
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
  placeholder?: string
}

const NO_LOCATION_KEY = "__nolocation__"

interface LocationGroup {
  location: string
  assets: Asset[]
}

function groupByLocation(assets: Asset[]): LocationGroup[] {
  const map = new Map<string, Asset[]>()
  for (const a of assets) {
    const key = a.location ?? NO_LOCATION_KEY
    const list = map.get(key) ?? []
    list.push(a)
    map.set(key, list)
  }
  return Array.from(map.entries())
    .map(([location, list]) => ({
      location: location === NO_LOCATION_KEY ? "Unassigned" : location,
      assets: list.sort((a, b) => a.code.localeCompare(b.code)),
    }))
    .sort((a, b) => a.location.localeCompare(b.location))
}

export function AssetMultiSelect({
  value,
  onChange,
  disabled,
  placeholder = "Select assets…",
}: AssetMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const { recent, push } = useRecentlyLinkedAssets()

  const raw = useQuery(api.assets.list)
  const assets = useMemo(
    () => (raw ? raw.map(toLegacyAsset) : []),
    [raw],
  )
  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets])

  const recentAssets = useMemo(
    () =>
      recent
        .map((id) => byId.get(id))
        .filter((a): a is Asset => Boolean(a))
        .slice(0, 5),
    [recent, byId],
  )

  const remainingGroups = useMemo(() => {
    const recentSet = new Set(recentAssets.map((a) => a.id))
    return groupByLocation(assets.filter((a) => !recentSet.has(a.id)))
  }, [assets, recentAssets])

  const selectedAssets = useMemo(
    () => assets.filter((a) => value.includes(a.id)),
    [assets, value],
  )

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((x) => x !== id))
    } else {
      onChange([...value, id])
      push(id)
    }
  }

  function removeOne(id: string) {
    onChange(value.filter((x) => x !== id))
  }

  return (
    <div className="space-y-2">
      {selectedAssets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedAssets.map((a) => (
            <Badge
              key={a.id}
              variant="secondary"
              className="gap-1 pr-1 font-mono text-xs"
            >
              {a.code}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeOne(a.id)
                }}
                className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-sm hover:bg-muted-foreground/20"
                aria-label={`Remove ${a.code}`}
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
            disabled={disabled}
          >
            <span className={cn("truncate", !selectedAssets.length && "text-muted-foreground")}>
              {selectedAssets.length
                ? `${selectedAssets.length} asset${selectedAssets.length === 1 ? "" : "s"} selected`
                : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search by code, name, or location…" />
            <CommandList>
              <CommandEmpty>No assets found.</CommandEmpty>
              {recentAssets.length > 0 && (
                <CommandGroup heading="Recently linked">
                  {recentAssets.map((a) => (
                    <AssetRow
                      key={a.id}
                      asset={a}
                      selected={value.includes(a.id)}
                      onToggle={toggle}
                    />
                  ))}
                </CommandGroup>
              )}
              {remainingGroups.map((g) => (
                <CommandGroup key={g.location} heading={g.location}>
                  {g.assets.map((a) => (
                    <AssetRow
                      key={a.id}
                      asset={a}
                      selected={value.includes(a.id)}
                      onToggle={toggle}
                    />
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function AssetRow({
  asset,
  selected,
  onToggle,
}: {
  asset: Asset
  selected: boolean
  onToggle: (id: string) => void
}) {
  return (
    <CommandItem
      value={`${asset.code} ${asset.name} ${asset.location ?? ""}`}
      onSelect={() => onToggle(asset.id)}
      className="flex items-center gap-2"
    >
      <div
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded-sm border",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-input",
        )}
      >
        {selected && <Check className="h-3 w-3" />}
      </div>
      {asset.pin_number != null && (
        <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-500/15 text-[9px] font-semibold text-emerald-700 dark:text-emerald-300">
          {asset.pin_number}
        </span>
      )}
      <span className="font-mono text-xs">{asset.code}</span>
      <span className="flex-1 truncate text-muted-foreground">· {asset.name}</span>
      {asset.location && (
        <span className="hidden items-center gap-0.5 text-[10px] text-muted-foreground sm:inline-flex">
          <MapPin className="h-2.5 w-2.5" />
          {asset.location}
        </span>
      )}
    </CommandItem>
  )
}
