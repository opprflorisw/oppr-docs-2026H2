# Trainings are controlled documents; Attempts are generated

A Training's definition follows the same review/approval lifecycle as a Document. That definition is its Learning objectives, source Documents, Round stops and pass mark. It is versioned, it needs an Engineer's sign-off, and it reuses the existing document lifecycle. The questions in each Attempt are generated fresh by the AI within those objectives and are not reviewed individually. Instead, every question cites its source passage, the whole Attempt is stored in the Training record, and people can mark a question as unclear or wrong.

We chose this because a Training record is evidence for a labour inspector, so the thing being trained must be approved by a human. Fixed question sets would let operators share answers and would wear out quickly. Reviewing every generated question is impossible. A Significant change to a source Document sends the linked Trainings back to review.
