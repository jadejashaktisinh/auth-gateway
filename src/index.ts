import "dotenv/config";
import path from "node:path";
import express from "express";
import vhost from "vhost";
import clientRoutes from "./routes/clients.routes.js";
import tokenRoutes from "./routes/token.routes.js";
import pageRoutes from "./routes/pages.routes.js";
import {
  dynamicProxySubdirectory,
  dynamicProxySubdomain,
} from "./routes/proxy.routes.js";
import { ProxyMiddleware } from "./middleware/porxy.middleware.js";
import { startDummyBackend } from "./dummy-backend.js";
import { startInventoryDummyBackend } from "./inventory-dummy-backend.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.set("trust proxy", 1);
app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));

app.get("/health", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).json({
    status: "ok",
    service: "auth-service",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

const domain = (process.env.DOMAIN ?? "").trim().replace(/^\.+/, "");

if (domain) {
  const ownHosts = [
    process.env.RENDER_EXTERNAL_HOSTNAME,
    process.env.PUBLIC_HOST,
  ]
    .filter((host): host is string => Boolean(host))
    .map((host) => host.trim().toLowerCase());

  const proxyApp = express();

  proxyApp.use((req, _res, next) => {
    const hostname = (req.hostname ?? "").toLowerCase();

    if (ownHosts.includes(hostname)) {
      next("router");
      return;
    }

    next();
  });
  proxyApp.use("/*route", ProxyMiddleware, dynamicProxySubdomain);

  app.use(vhost(`*.${domain}`, proxyApp));
}

app.use(express.static(path.join(process.cwd(), "public")));
app.use(express.json());
app.use("/", pageRoutes);
app.use("/", clientRoutes);
app.use("/", tokenRoutes);
app.use("/p/:companyname/*route", ProxyMiddleware, dynamicProxySubdirectory);

app.listen(port, () => {
  console.log(`Auth service listening on port ${port}`);
});

if (process.env.ENABLE_DEMO_BACKENDS !== "false") {
  startDummyBackend();
  startInventoryDummyBackend();
}
