import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  createGroup,
  addMembersToGroup,
  removeMemberFromGroup,
  updateGroupInfo,
  getGroupDetails,
} from "../controllers/group.controller.js";

const router = express.Router();

router.post("/create", protectRoute, createGroup);
router.post("/add-members/:groupId", protectRoute, addMembersToGroup);
router.delete("/remove-member/:groupId/:memberId", protectRoute, removeMemberFromGroup);
router.put("/update/:groupId", protectRoute, updateGroupInfo);
router.get("/:groupId", protectRoute, getGroupDetails);

export default router;
