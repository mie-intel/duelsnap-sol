const DEFAULT_IPFS_GATEWAY = "https://gateway.pinata.cloud";
const PUBLIC_FALLBACK_GATEWAYS = [
  DEFAULT_IPFS_GATEWAY,
  "https://ipfs.io",
  "https://cloudflare-ipfs.com",
];

function configuredGateway() {
  return process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? DEFAULT_IPFS_GATEWAY;
}

function normalizeGateway(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/ipfs") ? trimmed.slice(0, -5) : trimmed;
}

export function ipfsUrl(hashOrUrl: string, gateway = configuredGateway()) {
  const value = hashOrUrl.trim();
  if (/^https?:\/\//i.test(value)) return value;

  const cid = value.replace(/^ipfs:\/\//i, "").replace(/^\/?ipfs\//i, "");
  return `${normalizeGateway(gateway)}/ipfs/${cid}`;
}

export function ipfsFallbackUrls(hashOrUrl: string) {
  const value = hashOrUrl.trim();
  let cid = value.replace(/^ipfs:\/\//i, "").replace(/^\/?ipfs\//i, "");

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const parts = url.pathname.split("/").filter(Boolean);
      const ipfsIndex = parts.indexOf("ipfs");
      cid = ipfsIndex >= 0 ? parts.slice(ipfsIndex + 1).join("/") : "";
    } catch {
      cid = "";
    }
  }

  const urls = value && /^https?:\/\//i.test(value) ? [value] : [];
  if (cid) {
    for (const gateway of [configuredGateway(), ...PUBLIC_FALLBACK_GATEWAYS]) {
      urls.push(ipfsUrl(cid, gateway));
    }
  }

  return [...new Set(urls)];
}
