import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { subscribeToNotifications } from "../controllers/notification.controller.js";

const router = express.Router();

router.post("/subscribe", protectRoute, subscribeToNotifications);

export default router;
