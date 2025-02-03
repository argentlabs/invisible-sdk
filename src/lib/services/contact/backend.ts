import { IHttpService } from "@argent/x-shared"
import { addressSchema } from "../../primitives/address"
import * as v from "valibot"
import { Contact, ContactAddress, ContactService } from "./interface"

const telegramAccountSchema = v.object({
  chain: v.string(),
  address: addressSchema,
})

const getTelegramUserResponseSchema = v.object({
  id: v.number(),
  username: v.optional(v.nullable(v.string())),
  accounts: v.array(telegramAccountSchema),
})

const telegramUsernameRegex = /^@(?=\w{5,32}\b)[a-zA-Z0-9]+(?:_[a-zA-Z0-9]+)*$/

export class ContactArgentBackendService implements ContactService {
  constructor(
    protected readonly apiBase: string,
    protected readonly httpService: IHttpService,
  ) {}

  async getContacts(searchQuery: string = ""): Promise<Contact[]> {
    if (telegramUsernameRegex.test(searchQuery)) {
      const contact = await this.getContactByUsername(searchQuery.substring(1))
      if (contact) {
        return [contact]
      }
    }
    return []
  }

  async getContactByUsername(username: string): Promise<Contact | null> {
    return this.fetchContact(
      `${this.apiBase}/telegram/user?username=${username}`,
    )
  }

  async getContactById(id: number): Promise<Contact | null> {
    return this.fetchContact(`${this.apiBase}/telegram/user?userId=${id}`)
  }

  private async fetchContact(url: string): Promise<Contact | null> {
    try {
      const response = await this.httpService.get<unknown>(url)
      const validatedResponse = v.parse(getTelegramUserResponseSchema, response)

      return this.mapResponseToContact(validatedResponse)
    } catch (error) {
      console.error("Error fetching contact:", JSON.stringify(error))
      return null
    }
  }

  private mapResponseToContact(
    response: v.InferOutput<typeof getTelegramUserResponseSchema>,
  ): Contact {
    return {
      id: response.id,
      name: response.username ?? "",
      addresses: response.accounts
        .map((account) => ({
          chain: account.chain,
          address: account.address,
          name: response.username,
        }))
        .filter(
          (account): account is ContactAddress => account.chain === "starknet",
        ),
    }
  }
}
