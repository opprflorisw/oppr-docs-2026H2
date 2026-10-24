// A small JSON Schema checker for the MCP tool inputs (tools.ts). It covers
// exactly the subset those schemas use: type, enum, const, string and array
// lengths, integer ranges, object properties, required,
// additionalProperties: false and oneOf (tagged by a const "kind").
// Errors are short sentences an outside model can act on.

export interface JsonSchema {
  type?: "object" | "string" | "integer" | "number" | "boolean" | "array"
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: boolean
  items?: JsonSchema
  minItems?: number
  maxItems?: number
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  enum?: (string | number)[]
  const?: string | number
  oneOf?: JsonSchema[]
}

function typeOf(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  if (typeof value === "number" && Number.isInteger(value)) return "integer"
  return typeof value
}

function matchesType(schemaType: JsonSchema["type"], value: unknown): boolean {
  const t = typeOf(value)
  if (schemaType === "number") return t === "number" || t === "integer"
  return t === schemaType
}

export function validate(schema: JsonSchema, value: unknown, path = "arguments"): string[] {
  const errors: string[] = []

  if (schema.oneOf) {
    // Tagged union: pick the branch whose "kind" const matches.
    const kind = value && typeof value === "object" ? (value as Record<string, unknown>).kind : undefined
    const kinds = schema.oneOf.map((s) => s.properties?.kind?.const).filter((k) => k !== undefined)
    const branch = schema.oneOf.find((s) => s.properties?.kind?.const === kind)
    if (!branch) {
      errors.push(`${path}.kind must be one of: ${kinds.join(", ")}.`)
      return errors
    }
    return validate(branch, value, path)
  }

  if (schema.const !== undefined) {
    if (value !== schema.const) errors.push(`${path} must be "${schema.const}".`)
    return errors
  }

  if (schema.type && !matchesType(schema.type, value)) {
    errors.push(`${path} must be ${schema.type === "integer" ? "an integer" : `a ${schema.type}`}.`)
    return errors
  }

  if (schema.enum && !schema.enum.includes(value as string | number)) {
    errors.push(`${path} must be one of: ${schema.enum.join(", ")}.`)
    return errors
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (schema.minLength != null && trimmed.length < schema.minLength)
      errors.push(schema.minLength === 1 ? `${path} must not be empty.` : `${path} is too short.`)
    if (schema.maxLength != null && value.length > schema.maxLength)
      errors.push(`${path} is longer than ${schema.maxLength} characters.`)
  }

  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) errors.push(`${path} must be at least ${schema.minimum}.`)
    if (schema.maximum != null && value > schema.maximum) errors.push(`${path} must be at most ${schema.maximum}.`)
  }

  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems)
      errors.push(`${path} needs at least ${schema.minItems} item${schema.minItems === 1 ? "" : "s"}.`)
    if (schema.maxItems != null && value.length > schema.maxItems)
      errors.push(`${path} has more than ${schema.maxItems} items.`)
    if (schema.items) {
      value.forEach((item, i) => errors.push(...validate(schema.items!, item, `${path}[${i}]`)))
    }
  }

  if (schema.type === "object" && value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    const props = schema.properties ?? {}
    for (const key of schema.required ?? []) {
      if (obj[key] === undefined) errors.push(`${path}.${key} is required.`)
    }
    for (const [key, v] of Object.entries(obj)) {
      const sub = props[key]
      if (!sub) {
        if (schema.additionalProperties === false) {
          const allowed = Object.keys(props)
          errors.push(
            `${path}.${key} is not a known field.${allowed.length ? ` Known fields: ${allowed.join(", ")}.` : ""}`,
          )
        }
        continue
      }
      if (v === undefined) continue
      errors.push(...validate(sub, v, `${path}.${key}`))
    }
  }

  // Cap the list so a broken 400-block import does not flood the model.
  return errors.length > 25 ? [...errors.slice(0, 25), `...and ${errors.length - 25} more.`] : errors
}
