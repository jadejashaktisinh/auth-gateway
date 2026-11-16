import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  canonicalizeTargetUrl,
  demoBackends,
  demoMode,
} from "../../config/demo.js";

export type TargetValidationResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

export async function validateTargetUrl(
  raw: string,
): Promise<TargetValidationResult> {
  const canonical = canonicalizeTargetUrl(raw);

  if (!canonical) {
    return {
      ok: false,
      message: "Target URL must be a valid http(s) URL without credentials.",
    };
  }

  if (demoMode) {
    if (demoBackends.some((backend) => canonicalize(backend.url) === canonical)) {
      return { ok: true, url: canonical };
    }

    return {
      ok: false,
      message:
        "Demo mode only allows the built-in Orders and Inventory backends.",
    };
  }

  const hostname = normalizeHostname(new URL(canonical).hostname);

  if (isBlockedHostname(hostname)) {
    return {
      ok: false,
      message: "Target URL points to a private or internal address.",
    };
  }

  if (isIP(hostname) === 0) {
    try {
      const records = await lookup(hostname, { all: true, verbatim: true });

      if (
        records.length === 0 ||
        records.some((record) => isPrivateAddress(record.address))
      ) {
        return {
          ok: false,
          message: "Target host resolves to a private or reserved address.",
        };
      }
    } catch {
      return {
        ok: false,
        message: "Target host could not be resolved.",
      };
    }
  }

  return { ok: true, url: canonical };
}

export function isTargetAllowedForProxy(raw: string): boolean {
  const canonical = canonicalizeTargetUrl(raw);

  if (!canonical) {
    return false;
  }

  if (demoMode) {
    return demoBackends.some((backend) => canonicalize(backend.url) === canonical);
  }

  const hostname = normalizeHostname(new URL(canonical).hostname);
  return !isBlockedHostname(hostname);
}

export function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  const version = isIP(normalized);

  if (version === 4) {
    return isPrivateIPv4(normalized);
  }

  if (version === 6) {
    return isPrivateIPv6(normalized);
  }

  return false;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname);

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home.arpa") ||
    host === "metadata" ||
    host === "metadata.google.internal" ||
    host === "instance-data"
  ) {
    return true;
  }

  return isIP(host) !== 0 && isPrivateAddress(host);
}

function isPrivateIPv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  const first = octets[0] ?? -1;
  const second = octets[1] ?? -1;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isPrivateIPv6(address: string): boolean {
  if (address === "::" || address === "::1") {
    return true;
  }

  if (address.startsWith("::ffff:")) {
    const mapped = address.slice(7);

    if (isIP(mapped) === 4) {
      return isPrivateIPv4(mapped);
    }

    const groups = mapped.split(":");

    if (groups.length === 2) {
      const high = Number.parseInt(groups[0] ?? "", 16);
      const low = Number.parseInt(groups[1] ?? "", 16);

      if (Number.isFinite(high) && Number.isFinite(low)) {
        const ipv4 = `${(high >> 8) & 255}.${high & 255}.${(low >> 8) & 255}.${low & 255}`;
        return isPrivateIPv4(ipv4);
      }
    }
  }

  const first = Number.parseInt(address.split(":")[0] ?? "0", 16) || 0;

  if ((first & 0xfe00) === 0xfc00) {
    return true;
  }
  if ((first & 0xffc0) === 0xfe80 || (first & 0xffc0) === 0xfec0) {
    return true;
  }

  return (
    address.startsWith("64:ff9b:") ||
    address.startsWith("2001:db8:") ||
    address.startsWith("2001:0:")
  );
}

function normalizeHostname(hostname: string) {
  return hostname
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
}

function canonicalize(value: string) {
  return canonicalizeTargetUrl(value);
}
