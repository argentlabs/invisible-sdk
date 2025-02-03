import {
  postEvent,
  // retrieveLaunchParams,
} from "@telegram-apps/sdk-react"

const OPEN_TG_LINK_METHOD = "web_app_open_tg_link"
export const openTelegramLinkDirty = (url: string | URL): void => {
  url = new URL(url)
  postEvent(OPEN_TG_LINK_METHOD, { path_full: url.pathname + url.search })
}

// export async function openTelegramLinkAndClose(link: string): Promise<never> {
//   await new Promise((resolve) => setTimeout(resolve, 350))
//   miniApp.close()
//   return undefined as never
// }

// export function openTelegramLink(
//   link: string,
//   devRedirectMap: DevRedirectMap = developmentRedirectMap,
// ): void {
//   try {
//     if (link.includes("https")) {
//       return sdkOpenTelegramLink(link)
//     } else {
//       return openTelegramLinkDirty(link)
//     }
//   } catch (e) {
//     if (
//       typeof process !== "undefined" &&
//       process.env?.NODE_ENV === "production"
//     ) {
//       throw e
//     }
//     console.warn("Failed to open telegram link, probably outside of TG")
//
//     const redirectKeys = Object.keys(devRedirectMap)
//     const key = redirectKeys.find((key) => link.includes(key))
//     const value = key && devRedirectMap[key]
//     const alteredUrl = key && value && link.replace(key, value).split("?")[0]
//
//     // get search and hash from current location and attach it to the new url
//     let { search, hash } = window.location
//     const storedLaunchParams = sessionStorage.getItem("tma.js/launch-params")
//     if ((!search || !hash) && storedLaunchParams) {
//       try {
//         const params = new URLSearchParams(JSON.parse(storedLaunchParams))
//         search = `?tgWebAppStartParam=${params.get("tgWebAppStartParam")}`
//         params.delete("tgWebAppStartParam")
//         params.sort()
//         hash = `#${params.toString()}`
//       } catch (e) {
//         console.error(e)
//       }
//     }
//
//     const providedSearch = new URL(link).searchParams
//     const providedStartParam = providedSearch.get("startapp")
//
//     const alteredUrlWithHash =
//       alteredUrl +
//       search +
//       hash.replace(
//         /%26start_param%3D[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}%26/,
//         `%26start_param%3D${providedStartParam ?? ""}%26`,
//       )
//
//     const alteredUrlWithSearchAndHash = alteredUrlWithHash.replace(
//       /\?tgWebAppStartParam=[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}#/,
//       `?tgWebAppStartParam=${providedStartParam ?? ""}#`,
//     )
//
//     if (alteredUrl && alteredUrlWithSearchAndHash) {
//       window.location.href = alteredUrlWithSearchAndHash
//     }
//
//     throw e
//   }
// }

// export function retrieveInitData() {
//   const { initData } = retrieveLaunchParams()
//   if (!initData) {
//     throw new Error("No initData")
//   }
//   const { user, startParam } = initData
//   if (!user) {
//     throw new Error("No user in initData")
//   }
//   return { ...initData, startParam, user }
// }
