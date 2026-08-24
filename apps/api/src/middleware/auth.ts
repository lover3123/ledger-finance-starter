import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { User } from "../models/index.js";

export type AuthedRequest = Request & { userId?: string };

export function signToken(userId: string) {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: "7d" });
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function getUserFromToken(token: string) {
  const payload = jwt.verify(token, config.jwtSecret) as { userId: string };
  const user = await User.findById(payload.userId);
  if (!user) throw new Error("User not found");
  return user;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "Authentication required" });
  try {
    req.userId = (jwt.verify(token, config.jwtSecret) as { userId: string }).userId;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
