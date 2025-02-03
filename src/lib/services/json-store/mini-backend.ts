import assert from "assert"
import type { JsonObject } from "type-fest"
import { JsonStoreServiceInterface } from "./interface"

export class JsonStoreMiniBackendService<T extends JsonObject>
  implements JsonStoreServiceInterface<T>
{
  private _tag: T["_tag"] | undefined

  constructor(
    private endpoint: string,
    tag: T["_tag"],
  ) {
    assert(tag, "Missing tag")
    this._tag = tag
  }

  async put(content: Omit<T, "_tag">, id?: string): Promise<string> {
    content = { _tag: this._tag, ...content }
    const response = await fetch(`${this.endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, content }),
    })
    assert(response.ok, "Failed to put content")
    const result = await response.json()
    assert(
      !id || id === result.id,
      `input id (${id}) !== output id (${result.id})`,
    )
    return result.id
  }

  async get(key: string): Promise<T | undefined> {
    const response = await fetch(`${this.endpoint}?id=${key}`)
    if (!response.ok) {
      return
    }
    const { content } = (await response.json()) as { content: T }

    if (this._tag && content._tag !== this._tag) {
      return
    }

    return content
  }

  async delete(key: string): Promise<void> {
    const response = await fetch(`${this.endpoint}?id=${key}`, {
      method: "DELETE",
    })
    assert(response.ok, "Failed to delete content")
  }
}
