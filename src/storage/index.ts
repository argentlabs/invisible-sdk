export interface IStorageService {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
  getAllKeys(): string[]
  clear(): void
}

export class StorageService implements IStorageService {
  private storage: Storage

  constructor() {
    this.storage = window.localStorage
  }

  private validateKey(key: string): void {
    const keyRegex = /^[A-Za-z0-9_-]{1,128}$/
    if (!keyRegex.test(key)) {
      throw new Error(
        `Invalid key: "${key}" must be 1-128 characters long and contain only A-Z, a-z, 0-9, _ and -.`,
      )
    }
  }

  private validateValue(value: string): void {
    if (value.length > 4096) {
      throw new Error(
        `Invalid value: "${value}" must be 0-4096 characters long.`,
      )
    }
  }

  get(key: string): string | null {
    this.validateKey(key)

    return this.storage.getItem(key)
  }

  getAllKeys(): string[] {
    return Object.keys(this.storage)
  }

  set(key: string, value: string) {
    this.validateKey(key)
    this.validateValue(value)

    return this.storage.setItem(key, value)
  }

  remove(key: string) {
    this.validateKey(key)

    return this.storage.removeItem(key)
  }

  clear() {
    this.storage.clear()
  }
}

export const storageService = new StorageService()
