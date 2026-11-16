import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { demoInventoryPort } from "./config/demo.js";

export const inventoryDummyApp = express();

inventoryDummyApp.use(express.json());

inventoryDummyApp.get("/", (_req, res) => {
  res.status(200).json({
    service: "inventory",
    message: "Inventory dummy backend is running.",
  });
});

inventoryDummyApp.get("/inventory/:id", (req, res) => {
  res.status(200).json({
    service: "inventory",
    id: req.params.id,
    stock: 42,
    message: "Inventory fetched from the built-in dummy backend.",
  });
});

inventoryDummyApp.get("/inventory", (_req, res) => {
  res.status(200).json({
    service: "inventory",
    items: [
      { id: "123", stock: 42 },
      { id: "456", stock: 7 },
    ],
  });
});

inventoryDummyApp.post("/inventory/:id", handleInventoryUpdate);

function handleInventoryUpdate(
  req: express.Request,
  res: express.Response,
) {
  res.status(200).json({
    service: "inventory",
    id: req.params.id,
    message: "Inventory updated by the built-in dummy backend.",
    receivedData: req.body,
  });
}

export function startInventoryDummyBackend(port = demoInventoryPort) {
  const server = inventoryDummyApp.listen(port, () => {
    console.log(`Inventory dummy backend listening on port ${port}`);
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    console.error(
      `Inventory dummy backend could not start on port ${port}: ${error.message}`,
    );
  });

  return server;
}

const entryPoint = process.argv[1];

if (entryPoint && path.resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  startInventoryDummyBackend();
}
