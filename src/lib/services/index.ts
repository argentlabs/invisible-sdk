// Common error class for service method not found
class ServiceMethodNotFoundError extends Error {
  static readonly code = "SERVICE_METHOD_NOT_FOUND"
  public readonly code = ServiceMethodNotFoundError.code

  constructor(method: string | symbol) {
    super(`Service method not found: ${String(method)}`)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

// Type for any service
type AnyService = Record<string, any>

// Type for async function
type AsyncFunction = (...args: any[]) => Promise<any>

// Helper function to check if a result is fulfilled
const isFulfilled = <T>(
  result: PromiseSettledResult<T>,
): result is PromiseFulfilledResult<T> => result.status === "fulfilled"

// Helper function to check if a result is rejected
const isRejected = (
  result: PromiseSettledResult<unknown>,
): result is PromiseRejectedResult => result.status === "rejected"

// Helper function to check if an error is not a ServiceMethodNotFoundError
const isNotServiceMethodNotFoundError = (error: any): boolean =>
  !(
    error instanceof ServiceMethodNotFoundError &&
    error.code === ServiceMethodNotFoundError.code
  )

// Helper function to create a proxy for services
const createServiceProxy = <T extends AnyService>(
  handler: ProxyHandler<T>,
): T => new Proxy<T>({} as T, handler)

export function combineServices<T extends AnyService>(...services: T[]): T {
  return createServiceProxy<T>({
    get:
      (_, prop: string | symbol) =>
      async (...args: any[]) => {
        const results = await Promise.allSettled(
          services.map(async (service) => {
            if (prop in service) {
              return (service[prop as keyof T] as Function).apply(service, args)
            }
            throw new ServiceMethodNotFoundError(prop)
          }),
        )

        const firstValidAndNotNullResult = results.find(
          (result): result is PromiseFulfilledResult<unknown> =>
            isFulfilled(result) &&
            result.value !== null &&
            result.value !== undefined,
        )
        if (firstValidAndNotNullResult) {
          return firstValidAndNotNullResult.value
        }

        const firstValidResult = results.find(isFulfilled)
        if (firstValidResult) {
          return firstValidResult.value
        }

        const lastErrorWithoutNotImplemented = results
          .reverse()
          .find(
            (result): result is PromiseRejectedResult =>
              isRejected(result) &&
              isNotServiceMethodNotFoundError(result.reason),
          )?.reason

        throw (
          lastErrorWithoutNotImplemented ||
          new Error(`No service could handle the property: ${String(prop)}`)
        )
      },
  })
}

export function failoverServices<T extends AnyService>(...services: T[]): T {
  return createServiceProxy<T>({
    get:
      (_, prop: string | symbol) =>
      async (...args: any[]) => {
        for (const service of services) {
          try {
            return await (service[prop as keyof T] as Function).apply(
              service,
              args,
            )
          } catch (error) {
            if (service === services[services.length - 1]) {
              throw error
            }
          }
        }
      },
  })
}

export function routeToService<
  S extends Record<string | symbol, AnyService>,
  T extends S[keyof S] = S[keyof S],
>(services: S, condition: (prop: keyof T) => keyof S | Promise<keyof S>): T {
  return createServiceProxy<T>({
    get: (_, prop: string | symbol): unknown => {
      const result = condition(prop as keyof T)

      const getMethod = (serviceKey: keyof S) => {
        const service = services[serviceKey]
        return service[prop as keyof typeof service]
      }

      if (result instanceof Promise) {
        return async (...args: unknown[]): Promise<unknown> => {
          const serviceKey = await result
          const method = getMethod(serviceKey)

          if (typeof method === "function") {
            if (method.constructor.name === "AsyncFunction") {
              return (method as AsyncFunction).apply(services[serviceKey], args)
            }
            throw new Error(
              `Method ${String(prop)} is not async in the selected service`,
            )
          }
          throw new Error(
            `Property ${String(prop)} is not a function in the selected service`,
          )
        }
      }

      const method = getMethod(result)
      return typeof method === "function"
        ? method.bind(services[result])
        : method
    },
  })
}
