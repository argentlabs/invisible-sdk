import { validateChecksumAddress } from "starknet"
import { check, maxLength, minLength, pipe, transform } from "valibot"
import { Hex, hexSchema } from "../hex"

export type Address = Hex

export const addressSchema = pipe(
  hexSchema,
  maxLength(66, "Address must be at most 66 characters long"),
  check(
    (value) => !/[A-F]/.test(value) || validateChecksumAddress(value),
    "Address is not a valid checksum address",
  ),
  // Transform the address to a 66 character long address with a 0x prefix
  transform((value): Address => `0x${value.slice(2).padStart(64, "0")}`),
)

export const userInputAddressSchema = pipe(
  addressSchema,
  minLength(50, "Address must be at least 50 characters long"),
)
