export interface JsonStoreServiceInterface<T> {
  put(content: T): Promise<string>
  get(key: string): Promise<T | undefined>
}
