// StepListBlock — auto-numbered procedure steps.
//
// Two nodes:
//   • stepList — block container, holds N stepItem children
//   • stepItem — one step; renders a circular badge with the auto-number and
//     a content slot that holds editable inline content
//
// Authors get a clean visual distinct from <ol>: numbered chips, larger
// gutters, easier-to-scan procedure layout. Round-trips cleanly.

import { Node, mergeAttributes, type RawCommands } from "@tiptap/core"
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react"
import { cn } from "@/lib/utils"

function StepListView() {
  return (
    // A div with role list: ProseMirror puts its own divs between the list and
    // each step, which an <ol> may not contain (axe: list, listitem).
    <NodeViewWrapper as="div" role="list" aria-label="Steps" data-step-list className="my-4 flex flex-col gap-2 list-none pl-0">
      <NodeViewContent role="none" />
    </NodeViewWrapper>
  )
}

function StepItemView({ getPos, editor }: NodeViewProps) {
  // 1-based index from this node's position in its parent stepList.
  // ProseMirror's $pos.index() is exactly the sibling index.
  let index = 1
  try {
    const pos = typeof getPos === "function" ? getPos() : null
    if (pos != null) {
      const $pos = editor.state.doc.resolve(pos)
      index = $pos.index() + 1
    }
  } catch {
    // HMR edge case — leave index at 1 rather than crash the node view.
  }

  return (
    <NodeViewWrapper
      as="div"
      role="listitem"
      data-step-item
      className={cn(
        "flex items-start gap-3 rounded-md border bg-background px-3 py-2",
      )}
    >
      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {index}
      </span>
      <div className="min-w-0 flex-1 step-item-body">
        <NodeViewContent />
      </div>
    </NodeViewWrapper>
  )
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    stepList: {
      insertStepList: (count?: number) => ReturnType
    }
  }
}

export const StepListNode = Node.create({
  name: "stepList",
  group: "block",
  content: "stepItem+",
  defining: true,

  parseHTML() {
    return [{ tag: "ol[data-step-list]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["ol", mergeAttributes(HTMLAttributes, { "data-step-list": "" }), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(StepListView)
  },

  addCommands() {
    const commands: Partial<RawCommands> = {
      insertStepList:
        (count = 3) =>
        ({ chain }) => {
          const items = Array.from({ length: count }, () => ({
            type: "stepItem",
            content: [{ type: "paragraph" }],
          }))
          return chain()
            .focus()
            .insertContent({ type: this.name, content: items })
            .run()
        },
    }
    return commands as RawCommands
  },
})

export const StepItemNode = Node.create({
  name: "stepItem",
  content: "block+",
  defining: true,

  parseHTML() {
    return [{ tag: "li[data-step-item]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["li", mergeAttributes(HTMLAttributes, { "data-step-item": "" }), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(StepItemView, { attrs: { role: "none" } })
  },
})
