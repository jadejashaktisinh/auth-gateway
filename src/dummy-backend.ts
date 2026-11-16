import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { demoOrdersPort } from "./config/demo.js";

export const dummyApp = express();

dummyApp.use(express.json());

dummyApp.get("/", (_req, res) => {
  res.status(200).json({
    service: "orders",
    message: "Orders dummy backend is running.",
  });
});

dummyApp.get("/orders/:id", (req, res) => {
  res.status(200).json({
    service: "orders",
    id: req.params.id,
    status: "confirmed",
    message: "Order fetched from the built-in dummy backend.",
  });
});

dummyApp.get("/orders", (_req, res) => {
  res.status(200).json({
    service: "orders",
    orders: [
      { id: "123", status: "confirmed" },
      { id: "456", status: "processing" },
    ],
  });
});

dummyApp.post("/order/:id", handleOrderUpdate);
dummyApp.post("/orders/:id", handleOrderUpdate);

function handleOrderUpdate(
  req: express.Request,
  res: express.Response,
) {
  res.status(200).json({
    service: "orders",
    id: req.params.id,
    message: "Order updated by the built-in dummy backend.",
    receivedData: req.body,
  });
}

export function startDummyBackend(port = demoOrdersPort) {
  const server = dummyApp.listen(port, () => {
    console.log(`Orders dummy backend listening on port ${port}`);
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    console.error(
      `Orders dummy backend could not start on port ${port}: ${error.message}`,
    );
  });

  return server;
}

const entryPoint = process.argv[1];

if (entryPoint && path.resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  startDummyBackend();
}
