import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { User } from "../models/user.model.js";
import type { AuthUser } from "../types.js";
import { asyncHandler } from "../utils/async-handler.js";
import { HttpError } from "../utils/http-error.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/tokens.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

function toAuthUser(user: any): AuthUser {
  return {
    id: String(user._id),
    email: user.email,
    fullName: user.fullName,
    roles: user.roles,
    department: user.department,
  };
}

authRouter.post(
  "/login",
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user: any = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash +refreshTokenHash");

    if (!user) {
      throw new HttpError(401, "Invalid email or password.");
    }

    if (user.status !== "active") {
      throw new HttpError(423, "This account is not active. Contact the administrator.");
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpError(423, "Account is locked after failed login attempts.");
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= 5) {
        user.status = "locked";
        user.lockedUntil = new Date(Date.now() + 60 * 60 * 1000);
      }
      await user.save();
      throw new HttpError(401, "Invalid email or password.");
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = new Date();

    const authUser = toAuthUser(user);
    const accessToken = signAccessToken(authUser);
    const refreshToken = signRefreshToken(authUser);
    user.refreshTokenHash = await bcrypt.hash(refreshToken, env.BCRYPT_ROUNDS);
    await user.save();

    res.json({
      user: {
        ...authUser,
        mustChangePassword: user.mustChangePassword,
      },
      tokens: { accessToken, refreshToken },
    });
  }),
);

authRouter.post(
  "/refresh",
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const payload = verifyRefreshToken(refreshToken);
    const user: any = await User.findById(payload.sub).select("+refreshTokenHash");

    if (!user?.refreshTokenHash || !(await bcrypt.compare(refreshToken, user.refreshTokenHash))) {
      throw new HttpError(401, "Invalid refresh token.");
    }

    const authUser = toAuthUser(user);
    const accessToken = signAccessToken(authUser);
    const rotatedRefreshToken = signRefreshToken(authUser);
    user.refreshTokenHash = await bcrypt.hash(rotatedRefreshToken, env.BCRYPT_ROUNDS);
    await user.save();

    res.json({ tokens: { accessToken, refreshToken: rotatedRefreshToken } });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  }),
);

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(req.user?.id, { $unset: { refreshTokenHash: "" } });
    res.status(204).send();
  }),
);
