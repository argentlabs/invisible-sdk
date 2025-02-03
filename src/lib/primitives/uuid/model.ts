import { pipe, string, transform, uuid } from "valibot"

export type UUID = `${string}-${string}-${string}-${string}-${string}`

export const uuidSchema = pipe(
  string(),
  uuid(),
  transform((x) => x as UUID),
)
