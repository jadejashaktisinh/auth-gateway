import { type Request, type Response } from "express";

import { db } from "../db/db.js";
import { clients } from "../db/schema/schema.js";
import { generateApiKey } from "../utils/utils.js";
import { insertClientRoute } from "../models/client-routes.model.js";
import { validateTargetUrl } from "../utils/security/target-url.js";

type AuthenticatedClient = {
  id: string;
  companyName: string;
  apiKey: string;
};

export async function handleClientRegistration(req: Request, res: Response) {
  const { companyName } = req.body;

  const client = await db
    .insert(clients)
    .values({
      companyName: companyName,
      apiKey: generateApiKey(),
    })
    .returning();

  if (!client) {
    return res.status(400).json({
      success: false,
      message: "Somethign went wrong please try again after sometime",
    });
  }

  res.status(200).json({
    success: true,
    message: "Registration Successfull",
    client: client,
  });
}

export async function handleClientRouteCreation(req: Request, res: Response) {
  const { path, targeturl } = req.body;
  const client = res.locals.client as AuthenticatedClient | undefined;

  if (!client) {
    res.status(401).json({
      success: false,
      message: "The API key does not belong to this client.",
    });
    return;
  }

  const target = await validateTargetUrl(targeturl);

  if (!target.ok) {
    res.status(400).json({
      success: false,
      message: target.message,
    });
    return;
  }

  const client_route = await insertClientRoute({
    client_id: client.id,
    client_path: path,
    target_url: target.url,
  });

  if (!client_route) {
    res.status(400).json({
      success: false,
      message: "something went wrong",
    });
    return;
  }

  res.status(200).json({
    success: true,
    message: "Route created successfully",
    client_route: client_route,
  });
  return;
}
