import "dotenv/config";

export const demoOrdersPort = Number(process.env.DEMO_ORDERS_PORT ?? 3001);
export const demoInventoryPort = Number(process.env.DEMO_INVENTORY_PORT ?? 3002);

export type DemoTarget = {
  id: string;
  label: string;
  description: string;
  url: string;
  samplePath: string;
};

export const demoMode = process.env.DEMO_MODE !== "false";

export const demoBackends: DemoTarget[] = [
  {
    id: "orders",
    label: "Orders API",
    description: "Built-in dummy service for order lookups and updates.",
    url: stripTrailingSlash(
      process.env.DEMO_ORDERS_URL ?? `http://127.0.0.1:${demoOrdersPort}`,
    ),
    samplePath: "orders",
  },
  {
    id: "inventory",
    label: "Inventory API",
    description: "Built-in dummy service for inventory lookups and updates.",
    url: stripTrailingSlash(
      process.env.DEMO_INVENTORY_URL ?? `http://127.0.0.1:${demoInventoryPort}`,
    ),
    samplePath: "inventory",
  },
];

export function canonicalizeTargetUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (url.username || url.password || url.search || url.hash) {
      return null;
    }

    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

export function isDemoTarget(raw: string): boolean {
  const candidate = canonicalizeTargetUrl(raw);

  if (!candidate) {
    return false;
  }

  return demoBackends.some(
    (backend) => canonicalizeTargetUrl(backend.url) === candidate,
  );
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
