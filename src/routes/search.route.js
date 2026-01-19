// backend/src/routes/search.route.js
import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { searchUsersAndMessages } from "../controllers/search.controller.js";

const router = express.Router();

router.get("/", protectRoute, searchUsersAndMessages);

export default router;
