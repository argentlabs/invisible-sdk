import { pipe, regex, string, transform } from "valibot"

export type Hex = `0x${string}`

export const hexSchema = pipe(
  string(),
  regex(/^0x[0-9a-fA-F]+$/, "Hex must be a hex string starting with 0x"),
  transform((x) => x as Hex),
)

export function ellipsizeHex(hexString?: Hex) {
  if (!hexString) {
    return ""
  }
  if (hexString.length <= 13) {
    return hexString
  }

  const prefix = hexString.slice(0, 8)
  const suffix = hexString.slice(-4)

  return `${prefix}...${suffix}`
}
