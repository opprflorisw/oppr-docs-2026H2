import type { Id } from "../../../../convex/_generated/dataModel"
import { type AnswerDraft, type AttemptQuestion, QuestionCard } from "@/components/learn/training/QuestionCard"

/**
 * One Round question on the phone. The same card as a Training question:
 * the objective stays hidden until the answer is checked, a tap selects and
 * "Check answer" (in the page's sticky bar) commits. Choice, open (typed or
 * spoken), image and photo questions all work here.
 */
export function RoundQuestion({
  attemptId,
  personId,
  question,
  number,
  total,
  draft,
  feedbackRef,
}: {
  attemptId: Id<"trainingAttempts">
  personId: Id<"people">
  question: AttemptQuestion
  number: number
  total: number
  draft: AnswerDraft
  feedbackRef?: React.Ref<HTMLDivElement>
}) {
  return (
    <QuestionCard
      attemptId={attemptId}
      personId={personId}
      question={question}
      number={number}
      total={total}
      canAnswer
      draft={draft}
      hideCheck
      feedbackRef={feedbackRef}
    />
  )
}
