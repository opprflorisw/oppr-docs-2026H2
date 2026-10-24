import { useState } from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"

export interface PickerOption {
  id: string
  code: string
  label: string
  hint?: string
}

// Pick several items (Documents, Trainings) by code or title. Chosen items
// show as removable mono chips under the button.
export function MultiPicker({
  options,
  value,
  onChange,
  placeholder,
  empty,
}: {
  options: PickerOption[]
  value: string[]
  onChange: (ids: string[]) => void
  placeholder: string
  empty: string
}) {
  const [open, setOpen] = useState(false)
  const byId = new Map(options.map((o) => [o.id, o]))
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 w-full justify-between text-xs font-normal">
            <span className="text-muted-foreground">
              {value.length === 0 ? placeholder : `${value.length} selected`}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search by code or title" className="text-xs" />
            <CommandList>
              <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">{empty}</CommandEmpty>
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`${o.code} ${o.label}`}
                  onSelect={() => toggle(o.id)}
                  className="gap-2 text-xs"
                >
                  <Check className={cn("h-3.5 w-3.5", value.includes(o.id) ? "opacity-100" : "opacity-0")} />
                  <span className="font-mono">{o.code}</span>
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => {
            const o = byId.get(id)
            return (
              <span
                key={id}
                title={o?.label}
                className="inline-flex items-center gap-1 rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-xs"
              >
                {o?.code ?? "Removed"}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${o?.code ?? "item"}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
