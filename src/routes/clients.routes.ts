import { Router } from "express";
import {
  handleClientRegistration,
  handleClientRouteCreation,
} from "../controllers/clients.controller.js";
import {
  clientRegisterValidator,
  clientRouteAuth,
  clientRoutesValidator,
} from "../middleware/clients.middleware.js";
import { registrationRateLimit } from "../middleware/rate-limit.middleware.js";

const router: Router = Router();

router.post(
  "/client/register",
  registrationRateLimit,
  clientRegisterValidator,
  handleClientRegistration,
);

router.post(
  "/client/:clientid/routes",
  clientRoutesValidator,
  clientRouteAuth,
  handleClientRouteCreation,
);
export default router;
