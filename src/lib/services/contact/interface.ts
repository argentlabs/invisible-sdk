import { Address } from "../../primitives/address"

export interface ContactAddress {
  chain: "starknet"
  address: Address
  name: string
}

export interface Contact {
  id: number
  name: string
  addresses: ContactAddress[]
}

export interface ContactService {
  getContacts(searchQuery?: string): Promise<Contact[]>

  getContactById(id: number): Promise<Contact | null>
  getContactByUsername(username: string): Promise<Contact | null>
}
