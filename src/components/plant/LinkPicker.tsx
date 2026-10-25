import { useMemo, useState } from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type LinkOption = { id: string; label: string; sub: string }

/** Searchable multi-select: chips for what is picked, a list to pick more. */
export function LinkPicker({
  options,
  value,
  onChange,
  placeholder,
  noun,
}: {
  options: LinkOption[]
  value: string[]
  onChange: (ids: string[]) => void
  placeholder: string
  noun: string
}) {
  const [open, setOpen] = useState(false)
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options])
  const picked = value.map((id) => byId.get(id)).filter((o): o is LinkOption => !!o)

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])

  return (
    <div className="space-y-2">
      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picked.map((o) => (
            <Badge key={o.id} variant="secondary" className="gap-1 pr-1 text-xs font-normal">
              <span className="font-medium">{o.label}</span>
              {o.sub && o.sub !== o.label && (
                <span className="max-w-[12rem] truncate text-muted-foreground">{o.sub}</span>
              )}
              <button
                type="button"
                onClick={() => toggle(o.id)}
                className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-sm hover:bg-muted-foreground/20"
                aria-label={`Remove ${o.label}`}
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
          >
            <span className="truncate text-muted-foreground">
              {picked.length ? `${picked.length} ${noun}${picked.length === 1 ? "" : "s"} linked` : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search ${noun}s`} />
            <CommandList>
              <CommandEmpty>Nothing found.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => {
                  const on = value.includes(o.id)
                  return (
                    <CommandItem key={o.id} value={`${o.label} ${o.sub}`} onSelect={() => toggle(o.id)}>
                      <Check className={cn("mr-2 h-4 w-4 shrink-0", on ? "opacity-100" : "opacity-0")} />
                      <span className="mr-2 shrink-0 text-sm font-medium">{o.label}</span>
                      <span className="truncate text-xs text-muted-foreground">{o.sub}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
