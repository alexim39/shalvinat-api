import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { Notification } from "../models/notification.model.js";
import { asyncHandler } from "../utils/async-handler.js";

export const notificationRouter = Router();

notificationRouter.use(requireAuth);

notificationRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const roleQuery = req.user?.roles.map((role) => ({ role })) ?? [];
    const notifications = await Notification.find({
      $or: [{ recipient: req.user?.id }, ...roleQuery],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const unreadCount = notifications.filter((notification: any) => !notification.readAt).length;
    res.json({ data: notifications, unreadCount });
  }),
);

notificationRouter.patch(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const notification = await Notification.findByIdAndUpdate(req.params.id, { readAt: new Date() }, { new: true });
    res.json({ data: notification });
  }),
);
