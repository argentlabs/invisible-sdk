import { type BigDecimal } from "@argent/x-shared"

export function formatBalance(rawValue: string | bigint, decimals: number) {
  const value = BigInt(rawValue)
  const divisor = BigInt(10) ** BigInt(decimals)
  const integerPart = value / divisor
  const fractionalPart = value % divisor
  return `${integerPart}.${fractionalPart.toString().padStart(decimals, "0")}`
}

export function formatBigDecimalShort(rawValue: BigDecimal) {
  return formatBalanceShort(rawValue.value, rawValue.decimals)
}

export function formatBalanceShort(
  rawValue: string | bigint,
  decimals: number,
  formatFn = formatBalance,
) {
  const longFormatted = formatFn(rawValue, decimals)
  const [integerPart, fractionalPart] = longFormatted.split(".")
  if (BigInt(fractionalPart) === BigInt(0)) {
    return integerPart
  }
  const short = `${integerPart}.${fractionalPart.slice(0, 5)}`.replace(
    /0+$/,
    "",
  )
  if (short.endsWith(".") && BigInt(integerPart) === BigInt(0)) {
    return ">0.00001"
  }
  return short
}
