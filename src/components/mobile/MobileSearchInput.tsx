import { forwardRef } from "react"
import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface MobileSearchInputProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
  onFocus?: () => void
  onSubmit?: () => void
  label?: string
}

/** A 48px search field with 16px text, so iOS does not zoom in. */
export const MobileSearchInput = forwardRef<HTMLInputElement, MobileSearchInputProps>(function MobileSearchInput(
  { value, onChange, placeholder, className, autoFocus, onFocus, onSubmit, label },
  ref,
) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={ref}
        value={value}
        autoFocus={autoFocus}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onSubmit) {
            e.preventDefault()
            onSubmit()
          }
        }}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        className="h-12 rounded-2xl pl-11 pr-12 text-base [&::-webkit-search-cancel-button]:appearance-none"
        type="search"
        inputMode="search"
        enterKeyHint="search"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  )
})
