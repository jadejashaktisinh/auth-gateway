import type { NextFunction, Request, Response } from "express";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_REGISTRATIONS = 5;

type Entry = {
  count: number;
  resetAt: number;
};

const registrations = new Map<string, Entry>();

export function registrationRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  const entry = registrations.get(key);

  if (!entry || entry.resetAt <= now) {
    registrations.set(key, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }

  if (entry.count >= MAX_REGISTRATIONS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.set("Retry-After", retryAfter.toString());
    res.status(429).json({
      success: false,
      message: "Too many client registrations. Please try again later.",
    });
    return;
  }

  entry.count += 1;
  next();
}
