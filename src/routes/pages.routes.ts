import { randomBytes } from "node:crypto";
import { Router } from "express";
import { demoBackends, demoMode } from "../config/demo.js";

const router: Router = Router();

const demoTargets = demoBackends.map((backend) => ({
  id: backend.id,
  label: backend.label,
  description: backend.description,
  url: backend.url,
  samplePath: backend.samplePath,
}));

router.get("/", (_req, res) => {
  res.render("home", {
    title: "auth-service · Authenticated API gateway",
    current: "home",
    demoMode,
  });
});

router.get("/try", (_req, res) => {
  res.render("try", {
    title: "Try it · auth-service",
    current: "try",
    demoMode,
    demoTargets,
    suggestedCompanyName: `acme-${randomBytes(2).toString("hex")}`,
  });
});

router.get("/docs", (_req, res) => {
  res.render("docs", {
    title: "API docs · auth-service",
    current: "docs",
    demoMode,
  });
});

export default router;
