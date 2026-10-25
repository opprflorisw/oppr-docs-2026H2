// CONTRACT (owned by the images lane): the one dialog for picking an image
// from the library, used by the document editor, the Training builder and
// the guided writer. The images lane builds the real UI; props stay stable.
import type { Id } from "../../../convex/_generated/dataModel"

export type PickedImage = { imageId: Id<"images">; url: string | null; altText: string }

export type ImagePickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (image: PickedImage) => void
  /** Start with this search, e.g. the step text the image is for. */
  initialQuery?: string
  /** Narrow suggestions to these areas or Assets. */
  areaCodes?: string[]
  assetIds?: Id<"assets">[]
  title?: string
}

export function ImagePickerDialog(_props: ImagePickerDialogProps) {
  return null
}
