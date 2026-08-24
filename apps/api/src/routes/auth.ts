import { Router, type Response } from "express";
import { registerSchema, loginSchema, profileSchema, type AuthResponse } from "@ledger/shared";
import { User } from "../models/index.js";
import { hashPassword, requireAuth, signToken, verifyPassword, type AuthedRequest } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { toPayUser } from "../services/helpers.js";

export const authRouter = Router();

const publicUser = (user: any) => ({ id: String(user._id), name: user.name, email: user.email });

authRouter.post("/api/auth/register", rateLimit("register", 10, 60_000), async (req, res: Response) => {
  const input = registerSchema.parse(req.body);
  const email = input.email.toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) return res.status(409).json({ message: "Email is already registered" });
  const user = await User.create({ name: input.name, email, passwordHash: await hashPassword(input.password) });
  const response: AuthResponse = { token: signToken(String(user._id)), user: publicUser(user) };
  res.status(201).json(response);
});

authRouter.post("/api/auth/login", rateLimit("login", 20, 60_000), async (req, res: Response) => {
  const input = loginSchema.parse(req.body);
  const user = await User.findOne({ email: input.email.toLowerCase() });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  const response: AuthResponse = { token: signToken(String(user._id)), user: publicUser(user) };
  res.json(response);
});

authRouter.get(["/api/me", "/api/auth/me"], requireAuth, async (req: AuthedRequest, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(publicUser(user));
});

authRouter.patch("/api/users/me", requireAuth, async (req: AuthedRequest, res) => {
  const input = profileSchema.parse(req.body);
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ message: "User not found" });
  if (input.name) user.name = input.name;
  if (input.upiId !== undefined) user.upiId = input.upiId;
  if (input.phone !== undefined) user.phone = input.phone;
  await user.save();
  res.json(toPayUser(user));
});
