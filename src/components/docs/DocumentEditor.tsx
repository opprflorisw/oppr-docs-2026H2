// DocumentEditor
//
// TipTap-based authoring surface used by DocumentNewPage (initial body) and
// DocumentEditPage (edit existing). Wraps TipTap with:
//   - StarterKit + Image + Link + Placeholder + Table family
//   - Two custom nodes: launchLog (block) and linkedAsset (inline)
//   - A toolbar with bold / italic / strike / heading / list / quote / code
//     block / link / image / table / horizontal rule controls
//   - A simple "/" slash command: typing "/" at the start of an empty
//     paragraph opens a fixed-position floating panel (no tippy dependency)
//     positioned via `editor.view.coordsAtPos`. Items: H1/H2/H3, lists,
//     "Launch log…", "Linked asset…".
//
// The editor surfaces a JSON onChange so the page owns persistence.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { ImageWithRef } from "./ImageWithRef"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import Table from "@tiptap/extension-table"
import TableRow from "@tiptap/extension-table-row"
import TableCell from "@tiptap/extension-table-cell"
import TableHeader from "@tiptap/extension-table-header"
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Minus,
  Factory,
  Play,
  BookMarked,
  Type,
  HardHat,
  ChevronDown,
  AlertTriangle,
  Workflow as DiagramIcon,
  Info,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { LaunchLogNode, LaunchLogPicker } from "./LaunchLogBlock"
import { LinkedAssetNode, LinkedAssetPicker } from "./LinkedAssetBlock"
import { ReferenceDocNode, ReferenceDocPicker } from "./ReferenceDocBlock"
import { ImagePickerDialog } from "@/components/images/ImagePickerDialog"
import type { Id } from "../../../convex/_generated/dataModel"
import { InsertLinkDialog } from "./InsertLinkDialog"
import { CalloutNode, type CalloutKind } from "./CalloutBlock"
import { PpeNode, PpePicker, PpeQuickPalette, type PpeItem } from "./PpeBlock"
import { DiagramNode, DiagramPicker } from "./DiagramBlock"
import { StepListNode, StepItemNode } from "./StepListBlock"
import { PdfAttachmentNode } from "./PdfAttachmentBlock"
import { SafetyPalette } from "./SafetyPalette"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"

// TipTap StarterKit defaults — listed here so the hint stays honest. If an
// extension's binding changes, update this list.
const SHORTCUT_GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "Text",
    items: [
      ["Bold", "Ctrl+B"],
      ["Italic", "Ctrl+I"],
      ["Strikethrough", "Ctrl+Shift+S"],
      ["Inline code", "Ctrl+E"],
    ],
  },
  {
    title: "Blocks",
    items: [
      ["Heading 1", "Ctrl+Alt+1"],
      ["Heading 2", "Ctrl+Alt+2"],
      ["Heading 3", "Ctrl+Alt+3"],
      ["Paragraph", "Ctrl+Alt+0"],
      ["Bullet list", "Ctrl+Shift+8"],
      ["Numbered list", "Ctrl+Shift+7"],
      ["Quote", "Ctrl+Shift+B"],
      ["Code block", "Ctrl+Alt+C"],
    ],
  },
  {
    title: "General",
    items: [
      ["Undo", "Ctrl+Z"],
      ["Redo", "Ctrl+Y"],
      ["Block menu", "/ on an empty line"],
    ],
  },
]

function ShortcutsHint() {
  return (
    <HoverCard openDelay={100} closeDelay={150}>
      <HoverCardTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground"
          title="Keyboard shortcuts"
        >
          <Info className="h-4 w-4" />
        </Button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-72 p-3">
        <div className="space-y-3">
          <p className="text-xs font-semibold">Keyboard shortcuts</p>
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {group.items.map(([label, keys]) => (
                  <li
                    key={label}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span>{label}</span>
                    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

interface DocumentEditorProps {
  content: unknown
  onChange: (json: unknown) => void
  editable?: boolean
  placeholder?: string
  /** Compact mode: toolbar is single-row, no slash menu. Used on the New page. */
  compact?: boolean
  /**
   * Pixel offset for the sticky toolbar so it can dock below a sticky page
   * header (DocumentEditPage uses 40 to sit below the h-10 strip). Default 0.
   */
  toolbarTopOffset?: number
}

interface SlashItem {
  key: string
  label: string
  hint: string
  icon: ReactNode
  run: (editor: Editor) => void
}

function makeSlashItems(
  openLogPicker: () => void,
  openAssetPicker: () => void,
  openPpePicker: () => void,
  openDiagramPicker: () => void,
  insertCallout: (kind: CalloutKind) => void,
  insertSteps: () => void,
  openReferenceDocPicker: () => void,
): SlashItem[] {
  return [
    {
      key: "h1",
      label: "Heading 1",
      hint: "Section title",
      icon: <Heading1 className="h-4 w-4" />,
      run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      key: "h2",
      label: "Heading 2",
      hint: "Sub-section",
      icon: <Heading2 className="h-4 w-4" />,
      run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      key: "h3",
      label: "Heading 3",
      hint: "Smaller heading",
      icon: <Heading3 className="h-4 w-4" />,
      run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      key: "bullet",
      label: "Bullet list",
      hint: "Unordered list",
      icon: <List className="h-4 w-4" />,
      run: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      key: "ordered",
      label: "Numbered list",
      hint: "Ordered list",
      icon: <ListOrdered className="h-4 w-4" />,
      run: (e) => e.chain().focus().toggleOrderedList().run(),
    },
    {
      key: "step-list",
      label: "Numbered steps",
      hint: "Procedure steps with badges",
      icon: <ListChecks className="h-4 w-4" />,
      run: () => insertSteps(),
    },
    {
      key: "callout-warning",
      label: "Warning callout",
      hint: "Yellow warning box",
      icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
      run: () => insertCallout("warning"),
    },
    {
      key: "callout-danger",
      label: "Danger callout",
      hint: "Red danger box",
      icon: <AlertTriangle className="h-4 w-4 text-red-600" />,
      run: () => insertCallout("danger"),
    },
    {
      key: "callout-notice",
      label: "Notice callout",
      hint: "Blue info box",
      icon: <AlertTriangle className="h-4 w-4 text-sky-600" />,
      run: () => insertCallout("notice"),
    },
    {
      key: "callout-tip",
      label: "Tip callout",
      hint: "Green tip box",
      icon: <AlertTriangle className="h-4 w-4 text-emerald-600" />,
      run: () => insertCallout("tip"),
    },
    {
      key: "ppe",
      label: "Required PPE…",
      hint: "Pictogram row of PPE items",
      icon: <HardHat className="h-4 w-4 text-orange-600" />,
      run: () => openPpePicker(),
    },
    {
      key: "diagram",
      label: "Diagram…",
      hint: "Process flow / map / decision tree",
      icon: <DiagramIcon className="h-4 w-4 text-purple-600" />,
      run: () => openDiagramPicker(),
    },
    {
      key: "launch-log",
      label: "Launch log…",
      hint: "Hand off to an operational log",
      icon: <Play className="h-4 w-4 text-sky-600" />,
      run: () => openLogPicker(),
    },
    {
      key: "linked-asset",
      label: "Assets…",
      hint: "Reference a machine / asset inline",
      icon: <Factory className="h-4 w-4 text-emerald-600" />,
      run: () => openAssetPicker(),
    },
    {
      key: "reference-doc",
      label: "Reference document…",
      hint: "Cite another document. It is added to the References table on publish",
      icon: <BookMarked className="h-4 w-4 text-indigo-600" />,
      run: () => openReferenceDocPicker(),
    },
  ]
}

interface SlashMenuState {
  open: boolean
  /** Cursor position of the opening "/" so we can remove it on select. */
  triggerFrom: number
  query: string
  top: number
  left: number
  index: number
}

const CLOSED_SLASH: SlashMenuState = {
  open: false,
  triggerFrom: 0,
  query: "",
  top: 0,
  left: 0,
  index: 0,
}

// --- Toolbar button helpers -------------------------------------------------

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  label,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  /** A short visible word next to the icon, for the less obvious tools. */
  label?: string
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="sm"
      className={cn(label ? "h-8 gap-1 px-2 text-xs" : "h-8 w-8 p-0", active && "bg-secondary")}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label ? undefined : title}
    >
      {children}
      {label}
    </Button>
  )
}

function ToolbarDivider() {
  return <div className="mx-1 h-6 w-px bg-border" />
}

function ToolbarGroup({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 border-l border-border pl-2 first:border-l-0 first:pl-0",
        className,
      )}
    >
      {children}
    </div>
  )
}

// --- Component --------------------------------------------------------------

export function DocumentEditor({
  content,
  onChange,
  editable = true,
  placeholder = "Start writing… type / for blocks",
  compact = false,
  toolbarTopOffset = 0,
}: DocumentEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [slash, setSlash] = useState<SlashMenuState>(CLOSED_SLASH)
  const [logPickerOpen, setLogPickerOpen] = useState(false)
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const [referenceDocPickerOpen, setReferenceDocPickerOpen] = useState(false)
  const [ppePickerOpen, setPpePickerOpen] = useState(false)
  const [diagramPickerOpen, setDiagramPickerOpen] = useState(false)
  const [imageDialogOpen, setImageDialogOpen] = useState(false)
  const [imageContext, setImageContext] = useState<{ query: string; assetIds: Id<"assets">[] }>({
    query: "",
    assetIds: [],
  })
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkInitial, setLinkInitial] = useState<{
    url: string | null
    text: string
    openInNewTab: boolean
  }>({ url: null, text: "", openInNewTab: true })

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      ImageWithRef.configure({ inline: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder }),
      Table.configure({ resizable: true, handleWidth: 4, cellMinWidth: 80 }),
      TableRow,
      TableHeader,
      TableCell,
      LaunchLogNode,
      LinkedAssetNode,
      ReferenceDocNode,
      CalloutNode,
      PpeNode,
      DiagramNode,
      StepListNode,
      StepItemNode,
      PdfAttachmentNode,
    ],
    content: content as object | string,
    editable,
    editorProps: { attributes: { role: "textbox", "aria-label": "Document body", "aria-multiline": "true" } },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getJSON())
      // If the slash menu is open, update its query from the text after `/`.
      setSlash((prev) => {
        if (!prev.open) return prev
        const { from } = ed.state.selection
        if (from < prev.triggerFrom) return CLOSED_SLASH
        const text = ed.state.doc.textBetween(prev.triggerFrom, from, "\n", " ")
        // text starts with "/"; query is the remainder.
        if (!text.startsWith("/")) return CLOSED_SLASH
        return { ...prev, query: text.slice(1) }
      })
    },
    immediatelyRender: true,
  })

  // --- Slash trigger detection ---------------------------------------------

  const closeSlash = useCallback(() => setSlash(CLOSED_SLASH), [])

  const openSlash = useCallback(() => {
    if (!editor || !containerRef.current) return
    const { from } = editor.state.selection
    const coords = editor.view.coordsAtPos(from)
    const containerRect = containerRef.current.getBoundingClientRect()
    setSlash({
      open: true,
      // The "/" character is at `from - 1` after it's typed; we'll track from there.
      triggerFrom: from - 1,
      query: "",
      top: coords.bottom - containerRect.top + 4,
      left: coords.left - containerRect.left,
      index: 0,
    })
  }, [editor])

  useEffect(() => {
    if (!editor || compact) return
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "/" && editor) {
        // Open after the keypress is committed to the doc, so coords are correct.
        const { $from } = editor.state.selection
        // Only open if we're at the start of an empty-ish text block.
        const isEmptyBlock = $from.parent.textContent.length === 0
        if (isEmptyBlock) {
          // defer until after the / is inserted
          setTimeout(() => openSlash(), 0)
        }
      }
    }
    const dom = editor.view.dom
    dom.addEventListener("keydown", handleKeydown)
    return () => {
      dom.removeEventListener("keydown", handleKeydown)
    }
  }, [editor, compact, openSlash])

  // Close slash menu on blur, scroll, or escape.
  useEffect(() => {
    if (!slash.open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        closeSlash()
      }
    }
    function onScroll() {
      closeSlash()
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("scroll", onScroll, true)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("scroll", onScroll, true)
    }
  }, [slash.open, closeSlash])

  // --- Reflect controlled `content` updates --------------------------------

  // If parent sends a fresh content prop (e.g. after loading the doc), sync it.
  useEffect(() => {
    if (!editor) return
    const current = editor.getJSON()
    if (JSON.stringify(current) === JSON.stringify(content)) return
    if (content) {
      editor.commands.setContent(content as object | string, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, content])

  useEffect(() => {
    if (!editor) return
    if (editor.isEditable !== editable) editor.setEditable(editable)
  }, [editor, editable])

  // --- Slash menu state ----------------------------------------------------

  const slashItems = useMemo(
    () =>
      makeSlashItems(
        () => {
          // Close slash, remove the trigger text, then open the picker.
          if (editor) {
            editor
              .chain()
              .focus()
              .deleteRange({
                from: slash.triggerFrom,
                to: editor.state.selection.from,
              })
              .run()
          }
          closeSlash()
          setLogPickerOpen(true)
        },
        () => {
          if (editor) {
            editor
              .chain()
              .focus()
              .deleteRange({
                from: slash.triggerFrom,
                to: editor.state.selection.from,
              })
              .run()
          }
          closeSlash()
          setAssetPickerOpen(true)
        },
        () => {
          if (editor) {
            editor
              .chain()
              .focus()
              .deleteRange({
                from: slash.triggerFrom,
                to: editor.state.selection.from,
              })
              .run()
          }
          closeSlash()
          setPpePickerOpen(true)
        },
        () => {
          if (editor) {
            editor
              .chain()
              .focus()
              .deleteRange({
                from: slash.triggerFrom,
                to: editor.state.selection.from,
              })
              .run()
          }
          closeSlash()
          setDiagramPickerOpen(true)
        },
        (kind) => {
          if (!editor) return
          editor
            .chain()
            .focus()
            .deleteRange({
              from: slash.triggerFrom,
              to: editor.state.selection.from,
            })
            .insertCallout(kind)
            .run()
          closeSlash()
        },
        () => {
          if (!editor) return
          editor
            .chain()
            .focus()
            .deleteRange({
              from: slash.triggerFrom,
              to: editor.state.selection.from,
            })
            .insertStepList(3)
            .run()
          closeSlash()
        },
        () => {
          if (editor) {
            editor
              .chain()
              .focus()
              .deleteRange({
                from: slash.triggerFrom,
                to: editor.state.selection.from,
              })
              .run()
          }
          closeSlash()
          setReferenceDocPickerOpen(true)
        },
      ),
    [editor, slash.triggerFrom, closeSlash],
  )

  const filteredSlashItems = useMemo(() => {
    const q = slash.query.trim().toLowerCase()
    if (!q) return slashItems
    return slashItems.filter((it) =>
      it.label.toLowerCase().includes(q) || it.key.includes(q),
    )
  }, [slashItems, slash.query])

  // Keyboard navigation in slash menu (arrow up/down, Enter).
  useEffect(() => {
    if (!slash.open || !editor) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSlash((s) => ({
          ...s,
          index: (s.index + 1) % Math.max(filteredSlashItems.length, 1),
        }))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSlash((s) => ({
          ...s,
          index:
            (s.index - 1 + Math.max(filteredSlashItems.length, 1)) %
            Math.max(filteredSlashItems.length, 1),
        }))
      } else if (e.key === "Enter") {
        e.preventDefault()
        const item = filteredSlashItems[slash.index]
        if (item && editor) {
          // Remove "/query" before running the action.
          editor
            .chain()
            .focus()
            .deleteRange({
              from: slash.triggerFrom,
              to: editor.state.selection.from,
            })
            .run()
          // For built-in transforms, run after deletion.
          if (item.key !== "launch-log" && item.key !== "linked-asset") {
            item.run(editor)
            closeSlash()
          } else {
            // openers handle their own picker open
            item.run(editor)
          }
        }
      }
    }
    document.addEventListener("keydown", onKey, true)
    return () => document.removeEventListener("keydown", onKey, true)
  }, [slash.open, slash.index, filteredSlashItems, editor, slash.triggerFrom, closeSlash])

  // --- Custom node insertion handlers --------------------------------------

  function handleInsertLaunchLog(attrs: {
    logId: string
    anchorId: string
    label: string
    code?: string
  }) {
    if (!editor) return
    editor.chain().focus().insertLaunchLog(attrs).run()
  }

  function handleInsertLinkedAsset(attrs: { assetId: string; label: string }) {
    if (!editor) return
    editor.chain().focus().insertLinkedAsset(attrs).run()
  }

  function handleInsertReferenceDoc(attrs: {
    docId: string
    code: string
    label: string
  }) {
    if (!editor) return
    editor.chain().focus().insertReferenceDoc(attrs).run()
  }

  // --- Toolbar callbacks ---------------------------------------------------

  function setLink() {
    if (!editor) return
    const previous = editor.getAttributes("link") as {
      href?: string
      target?: string
    }
    const { from, to, empty } = editor.state.selection
    const selectedText = empty
      ? ""
      : editor.state.doc.textBetween(from, to, " ")
    setLinkInitial({
      url: previous.href ?? null,
      text: selectedText,
      openInNewTab: previous.target === "_blank",
    })
    setLinkDialogOpen(true)
  }

  function applyLink(args: { url: string; text: string; openInNewTab: boolean }) {
    if (!editor) return
    // Naming code → /n/<code> (resolver route TBD); URLs pass through.
    const looksLikeNamingCode = /^[A-Z]{2,5}-[A-Z]{2,5}-[A-Z]{2,5}-\d{3,4}$/.test(args.url)
    const href = looksLikeNamingCode ? `/n/${args.url}` : args.url
    const target = args.openInNewTab ? "_blank" : null
    const rel = args.openInNewTab ? "noopener noreferrer" : null
    const { from, to, empty } = editor.state.selection
    if (empty) {
      // Insert new text + link at the cursor
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: args.text,
          marks: [
            { type: "link", attrs: { href, target, rel } as Record<string, string | null> },
          ],
        })
        .run()
    } else {
      // Apply link to the current selection. If text changed, replace it.
      const selectedText = editor.state.doc.textBetween(from, to, " ")
      if (args.text && args.text !== selectedText) {
        editor
          .chain()
          .focus()
          .insertContentAt(
            { from, to },
            {
              type: "text",
              text: args.text,
              marks: [
                { type: "link", attrs: { href, target, rel } as Record<string, string | null> },
              ],
            },
          )
          .run()
      } else {
        editor
          .chain()
          .focus()
          .extendMarkRange("link")
          .setLink({ href, target, rel } as { href: string })
          .run()
      }
    }
  }

  function unsetLinkMark() {
    if (!editor) return
    editor.chain().focus().extendMarkRange("link").unsetLink().run()
  }

  function insertImage() {
    if (!editor) return
    // Suggest pictures for the step at the cursor and the Assets linked in the body.
    const assetIds = new Set<string>()
    editor.state.doc.descendants((node) => {
      if (node.type.name === "linkedAsset" && node.attrs.assetId) assetIds.add(String(node.attrs.assetId))
    })
    setImageContext({
      query: editor.state.selection.$from.parent.textContent.trim().slice(0, 200),
      assetIds: Array.from(assetIds) as Id<"assets">[],
    })
    setImageDialogOpen(true)
  }

  function insertTable() {
    if (!editor) return
    editor
      .chain()
      .focus()
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      .run()
  }

  if (!editor) {
    return <div className="rounded-md border p-4 text-sm text-muted-foreground">Loading editor…</div>
  }

  // --- Render ---------------------------------------------------------------

  return (
    <div ref={containerRef} className="relative">
      {editable && (
        <div
          className="sticky z-10 flex flex-wrap items-center gap-2 rounded-t-md border border-b-0 bg-muted p-1.5 shadow-sm"
          style={{ top: toolbarTopOffset }}
        >
          {/* Heading select — left-most */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-xs font-medium"
                title="Paragraph style"
              >
                {editor.isActive("heading", { level: 1 }) ? (
                  <>
                    <Heading1 className="h-4 w-4" /> H1
                  </>
                ) : editor.isActive("heading", { level: 2 }) ? (
                  <>
                    <Heading2 className="h-4 w-4" /> H2
                  </>
                ) : editor.isActive("heading", { level: 3 }) ? (
                  <>
                    <Heading3 className="h-4 w-4" /> H3
                  </>
                ) : (
                  <>
                    <Type className="h-4 w-4" /> Text
                  </>
                )}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => editor.chain().focus().setParagraph().run()}>
                <Type className="mr-2 h-4 w-4" /> Paragraph
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
                <Heading1 className="mr-2 h-4 w-4" /> Heading 1
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
                <Heading2 className="mr-2 h-4 w-4" /> Heading 2
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
                <Heading3 className="mr-2 h-4 w-4" /> Heading 3
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Group: Text */}
          <ToolbarGroup>
            <ToolbarButton
              title="Bold"
              active={editor.isActive("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Italic"
              active={editor.isActive("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Strikethrough"
              active={editor.isActive("strike")}
              onClick={() => editor.chain().focus().toggleStrike().run()}
            >
              <Strikethrough className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Quote"
              active={editor.isActive("blockquote")}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            >
              <Quote className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Code block"
              active={editor.isActive("codeBlock")}
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            >
              <Code className="h-4 w-4" />
            </ToolbarButton>
          </ToolbarGroup>

          {/* Group: Lists */}
          <ToolbarGroup>
            <ToolbarButton
              title="Bullet list"
              active={editor.isActive("bulletList")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Numbered list"
              active={editor.isActive("orderedList")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Numbered steps"
              onClick={() => editor.chain().focus().insertStepList(3).run()}
            >
              <ListChecks className="h-4 w-4" />
            </ToolbarButton>
          </ToolbarGroup>

          {/* Group: Insert */}
          <ToolbarGroup>
            <ToolbarButton
              title="Link"
              active={editor.isActive("link")}
              onClick={setLink}
            >
              <LinkIcon className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton title="Table" onClick={insertTable}>
              <TableIcon className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Horizontal rule"
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
            >
              <Minus className="h-4 w-4" />
            </ToolbarButton>
          </ToolbarGroup>

          {!compact && (
            <>
              {/* Group: Safety */}
              <ToolbarGroup>
                <SafetyPalette
                  onSelect={(kind) =>
                    editor.chain().focus().insertCallout(kind).run()
                  }
                />
                <PpeQuickPalette
                  onInsert={(items: PpeItem[]) =>
                    editor.chain().focus().insertPpe(items).run()
                  }
                />
              </ToolbarGroup>

              {/* Group: Figures — image + diagram */}
              <ToolbarGroup>
                <ToolbarButton title="Image: pick from the library, upload or create" onClick={insertImage}>
                  <ImageIcon className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  title="Insert a diagram: a process line or a decision flow, with machines linked"
                  label="Diagram"
                  onClick={() => setDiagramPickerOpen(true)}
                >
                  <DiagramIcon className="h-4 w-4 text-purple-600" />
                </ToolbarButton>
              </ToolbarGroup>

              {/* Group: Links — assets + reference documents */}
              <ToolbarGroup>
                <ToolbarButton
                  title="Link a machine (Asset)"
                  label="Asset"
                  onClick={() => setAssetPickerOpen(true)}
                >
                  <Factory className="h-4 w-4 text-emerald-600" />
                </ToolbarButton>
                <ToolbarButton
                  title="Reference document"
                  onClick={() => setReferenceDocPickerOpen(true)}
                >
                  <BookMarked className="h-4 w-4 text-indigo-600" />
                </ToolbarButton>
                <ToolbarButton
                  title="Launch log"
                  onClick={() => setLogPickerOpen(true)}
                >
                  <Play className="h-4 w-4 text-sky-600" />
                </ToolbarButton>
              </ToolbarGroup>
            </>
          )}

          <ToolbarGroup className={cn(compact && "ml-auto")}>
            <ShortcutsHint />
          </ToolbarGroup>
        </div>
      )}

      <EditorContent
        editor={editor}
        className={cn(
          "tiptap-content min-h-[300px] rounded-b-md border bg-background px-6 py-5 focus-within:outline-none",
          !editable && "rounded-md",
        )}
      />

      {/* Slash command popup */}
      {slash.open && filteredSlashItems.length > 0 && (
        <div
          className="absolute z-50 w-64 rounded-md border bg-popover p-1 shadow-md"
          style={{ top: slash.top, left: slash.left }}
        >
          <ul className="max-h-64 overflow-auto">
            {filteredSlashItems.map((item, i) => (
              <li key={item.key}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                    i === slash.index ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                  )}
                  onMouseEnter={() =>
                    setSlash((s) => ({ ...s, index: i }))
                  }
                  onClick={() => {
                    if (!editor) return
                    editor
                      .chain()
                      .focus()
                      .deleteRange({
                        from: slash.triggerFrom,
                        to: editor.state.selection.from,
                      })
                      .run()
                    const opensDialog =
                      item.key === "launch-log" ||
                      item.key === "linked-asset" ||
                      item.key === "reference-doc" ||
                      item.key === "ppe" ||
                      item.key === "diagram"
                    if (!opensDialog) {
                      item.run(editor)
                      closeSlash()
                    } else {
                      item.run(editor)
                    }
                  }}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-sm border bg-background">
                    {item.icon}
                  </span>
                  <span className="flex-1">
                    <div className="font-medium">{item.label}</div>
                    <div className="text-xs text-muted-foreground">{item.hint}</div>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <LaunchLogPicker
        open={logPickerOpen}
        onOpenChange={setLogPickerOpen}
        onSelect={handleInsertLaunchLog}
      />
      <ReferenceDocPicker
        open={referenceDocPickerOpen}
        onOpenChange={setReferenceDocPickerOpen}
        onSelect={handleInsertReferenceDoc}
      />
      <LinkedAssetPicker
        open={assetPickerOpen}
        onOpenChange={setAssetPickerOpen}
        onSelect={handleInsertLinkedAsset}
      />
      <PpePicker
        open={ppePickerOpen}
        onOpenChange={setPpePickerOpen}
        onSelect={(items: PpeItem[]) => {
          if (!editor) return
          editor.chain().focus().insertPpe(items).run()
        }}
      />
      <DiagramPicker
        open={diagramPickerOpen}
        onOpenChange={setDiagramPickerOpen}
        onSelect={(attrs) => {
          if (!editor) return
          editor.chain().focus().insertDiagram(attrs).run()
        }}
      />
      <ImagePickerDialog
        open={imageDialogOpen}
        onOpenChange={setImageDialogOpen}
        initialQuery={imageContext.query}
        assetIds={imageContext.assetIds}
        onPick={({ imageId, altText, url }) => {
          if (!editor) return
          editor
            .chain()
            .focus()
            .insertContent({
              type: "image",
              attrs: { src: url ?? "", alt: altText, "data-image-id": imageId },
            })
            .run()
        }}
      />
      <InsertLinkDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        initialUrl={linkInitial.url}
        initialText={linkInitial.text}
        initialOpenInNewTab={linkInitial.openInNewTab}
        onInsert={applyLink}
        onUnlink={unsetLinkMark}
      />
    </div>
  )
}
