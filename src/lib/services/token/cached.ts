import { Address, IHttpService, TokenServiceWeb } from "@argent/x-shared"
import { memoize } from "moderndash"

const ttl = /* 5 minute */ 60e3 * 5

export class CachedTokenServiceWeb extends TokenServiceWeb {
  constructor(
    baseUrl: string,
    public httpService: IHttpService,
  ) {
    super(baseUrl, httpService)
  }

  fetchTokensInfoFromBackend = memoize(
    (tokenAddress?: Address) => {
      return super.fetchTokensInfoFromBackend(tokenAddress)
    },
    { ttl },
  )
}
