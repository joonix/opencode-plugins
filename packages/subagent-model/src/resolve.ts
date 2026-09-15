export interface ModelRef {
  readonly providerID: string
  readonly id: string
  readonly variant?: string
}

export interface ModelInfo extends ModelRef {
  readonly variants: readonly { readonly id: string }[]
}

export interface Override {
  readonly model?: string
  readonly variant?: string
}

export function parseModel(value: string): Omit<ModelRef, "variant"> {
  const slash = value.indexOf("/")
  if (slash < 1 || slash === value.length - 1) {
    throw new Error(`Invalid model "${value}". Expected provider/model-id.`)
  }
  return { providerID: value.slice(0, slash), id: value.slice(slash + 1) }
}

export function resolveOverride(input: Override, base: ModelRef, models: readonly ModelInfo[]): ModelRef | undefined {
  if (!input.model && !input.variant) return undefined
  const selected = input.model ? parseModel(input.model) : { providerID: base.providerID, id: base.id }
  const model = models.find((item) => item.providerID === selected.providerID && item.id === selected.id)
  if (!model) {
    const valid = models.map((item) => `${item.providerID}/${item.id}`).sort().join(", ")
    throw new Error(`Unknown model "${selected.providerID}/${selected.id}". Available models: ${valid}`)
  }
  if (input.variant && !model.variants.some((item) => item.id === input.variant)) {
    const valid = model.variants.map((item) => item.id).join(", ") || "none"
    throw new Error(`Unknown variant "${input.variant}" for ${selected.providerID}/${selected.id}. Available variants: ${valid}`)
  }
  return { ...selected, ...(input.variant ? { variant: input.variant } : {}) }
}

export interface Pending {
  readonly parentID: string
  readonly agent: string
  readonly prompt: string
  readonly marker: string
  readonly model: ModelRef
  readonly createdAt: number
}

export function takePending(
  pending: Pending[],
  child: { readonly parentID?: string; readonly agent?: string },
  prompt: string,
  now = Date.now(),
): Pending | undefined {
  const cutoff = now - 5 * 60_000
  for (let i = pending.length - 1; i >= 0; i--) if (pending[i]!.createdAt < cutoff) pending.splice(i, 1)
  const index = pending.findIndex(
    (item) => item.parentID === child.parentID && item.agent === child.agent && prompt.endsWith(item.marker),
  )
  if (index < 0) return undefined
  return pending.splice(index, 1)[0]
}

export function marker(callID: string): string {
  return `\n<opencode-subagent-model call="${callID}"/>`
}
