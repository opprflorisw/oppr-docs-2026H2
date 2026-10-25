export const EMBEDDING_MODEL = "gemini-embedding-2"
export const EMBEDDING_DIM = 768
export const CHAT_MODEL = "gemini-3.1-flash-lite"
export const IMAGE_MODEL = "gemini-3.1-flash-lite-image"

export const EMBEDDING_MODEL_VERSION = `${EMBEDDING_MODEL}@${EMBEDDING_DIM}`

// Images are embedded with a natively multimodal model so a text query, a
// photo and a passage share one vector space. Verified on dev 2026-10-25:
// gemini-embedding-2 embedContent accepts an inline_data image part and
// returns 768 values. Must stay in the same space as EMBEDDING_MODEL; swap
// both together (and re-embed) if this changes.
export const IMAGE_EMBEDDING_MODEL = EMBEDDING_MODEL
export const IMAGE_EMBEDDING_MODEL_VERSION = `${IMAGE_EMBEDDING_MODEL}@${EMBEDDING_DIM}`
