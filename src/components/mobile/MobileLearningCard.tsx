import { Link } from "wouter"
import { ChevronRight, ListTodo } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { TodoRow, type TodoItem } from "./MobileTodo"

/**
 * "To do" on Home: the next 2 things to do, by due date, each with one
 * action. A blocked Training is never offered; it waits in Me with its reason.
 */
export function MobileLearningCard({ items, loading }: { items: TodoItem[]; loading: boolean }) {
  if (loading) {
    return (
      <section className="flex flex-col gap-2">
        <Heading count={null} />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </section>
    )
  }
  const doable = items.filter((i) => !i.waiting)
  const waiting = items.length - doable.length
  if (items.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <Heading count={0} />
        <p className="rounded-2xl border bg-card px-4 py-3 text-base text-muted-foreground">
          Nothing to do right now. Your Skills are up to date.
        </p>
      </section>
    )
  }
  const shown = doable.slice(0, 2)
  const more = doable.length - shown.length
  return (
    <section className="flex flex-col gap-2">
      <Heading count={doable.length} />
      {shown.length === 0 && (
        <Link
          href="/m/me"
          className="flex min-h-14 items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-base text-muted-foreground"
        >
          <span className="flex-1">
            Nothing to do now. {waiting === 1 ? "One item is" : `${waiting} items are`} waiting for someone else.
          </span>
          <ChevronRight className="h-5 w-5 shrink-0" />
        </Link>
      )}
      {shown.map((item) => (
        <TodoRow key={item.key} item={item} busy={item.action?.label === "Starting"} />
      ))}
      {(more > 0 || (shown.length > 0 && waiting > 0)) && (
        <Link
          href="/m/me"
          className="flex min-h-11 items-center justify-center gap-1 rounded-xl text-sm font-semibold text-[#6E59A5]"
        >
          {more > 0 ? `${more} more in Me` : `${waiting} waiting for someone, in Me`}
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </section>
  )
}

function Heading({ count }: { count: number | null }) {
  return (
    <h2 className="flex items-center gap-1.5 px-1 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
      <ListTodo className="h-4 w-4" />
      To do{count ? ` · ${count}` : ""}
    </h2>
  )
}
