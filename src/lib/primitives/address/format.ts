import { Address } from "./model"

export function formatAddress(address: Address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
