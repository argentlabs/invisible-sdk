import type { Hex } from "./model"

export function isEqualHex(a: Hex, b: Hex): boolean {
  if (!a || !b) return false
  return BigInt(a) === BigInt(b)
}
