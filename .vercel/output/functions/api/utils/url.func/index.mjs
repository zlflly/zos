import { createRequire as VPV_createRequire } from "node:module";
import { fileURLToPath as VPV_fileURLToPath } from "node:url";
import { dirname as VPV_dirname } from "node:path";
const require = VPV_createRequire(import.meta.url);
const __filename = VPV_fileURLToPath(import.meta.url);
const __dirname = VPV_dirname(__filename);


// api/utils/url.ts
function normalizeUrlForCacheKey(url) {
  if (!url) return null;
  let tempUrl = url.trim();
  if (!tempUrl.startsWith("http://") && !tempUrl.startsWith("https://")) {
    tempUrl = `https://${tempUrl}`;
  }
  try {
    const parsed = new URL(tempUrl);
    let keyPath = parsed.pathname;
    if (keyPath.endsWith("/")) {
      keyPath = keyPath.slice(0, -1);
    }
    if (keyPath === "") {
      keyPath = "";
    }
    const keyBase = `${parsed.origin}${keyPath}${parsed.search}${parsed.hash}`;
    return keyBase;
  } catch (e) {
    console.error(`[URL Normalization Error] Failed for URL: ${url}`, e);
    return tempUrl;
  }
}
export {
  normalizeUrlForCacheKey
};
