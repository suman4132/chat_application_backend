import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import Chat from "../models/chat.model.js";
import cloudinary from "../lib/cloudinary.js";

export const createGroup = async (req, res) => {
  try {
    const { name, members, groupImage } = req.body;
    const admin = req.user._id;

    if (!name || !members || members.length === 0) {
      return res.status(400).json({ error: "Group name and members are required" });
    }

    // Ensure all members exist
    const existingMembers = await User.find({ _id: { $in: members } });
    if (existingMembers.length !== members.length) {
      return res.status(400).json({ error: "One or more members not found" });
    }

    let groupImageUrl = null;
    if (groupImage) {
      const uploadResponse = await cloudinary.uploader.upload(groupImage, { resource_type: "image" });
      groupImageUrl = uploadResponse.secure_url;
    }

    const newGroup = new Group({
      name,
      members: [...members, admin],
      admin,
      groupImage: groupImageUrl,
    });

    await newGroup.save();

    // Create a new chat for the group
    const newChat = new Chat({
      chatType: "group",
      group: newGroup._id,
      participants: [...members, admin],
    });

    await newChat.save();

    res.status(201).json(newGroup);
  } catch (error) {
    console.error("Error in createGroup controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const addMembersToGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { newMembers } = req.body;
    const userId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    if (group.admin.toString() !== userId.toString()) {
      return res.status(403).json({ error: "Only group admin can add members" });
    }

    // Ensure new members exist and are not already in the group
    const existingNewMembers = await User.find({ _id: { $in: newMembers } });
    if (existingNewMembers.length !== newMembers.length) {
      return res.status(400).json({ error: "One or more new members not found" });
    }

    const membersToAdd = newMembers.filter((memberId) => !group.members.includes(memberId));

    if (membersToAdd.length === 0) {
      return res.status(400).json({ error: "All provided users are already members of the group" });
    }

    group.members.push(...membersToAdd);
    await group.save();

    // Update chat participants
    const chat = await Chat.findOne({ group: groupId });
    if (chat) {
      chat.participants.push(...membersToAdd);
      await chat.save();
    }

    res.status(200).json(group);
  } catch (error) {
    console.error("Error in addMembersToGroup controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const removeMemberFromGroup = async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    const userId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    if (group.admin.toString() !== userId.toString()) {
      return res.status(403).json({ error: "Only group admin can remove members" });
    }

    if (group.admin.toString() === memberId.toString()) {
      return res.status(400).json({ error: "Admin cannot remove themselves from the group" });
    }

    group.members = group.members.filter((member) => member.toString() !== memberId.toString());
    await group.save();

    // Update chat participants
    const chat = await Chat.findOne({ group: groupId });
    if (chat) {
      chat.participants = chat.participants.filter(
        (participant) => participant.toString() !== memberId.toString()
      );
      await chat.save();
    }

    res.status(200).json(group);
  } catch (error) {
    console.error("Error in removeMemberFromGroup controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateGroupInfo = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name, groupImage } = req.body;
    const userId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    if (group.admin.toString() !== userId.toString()) {
      return res.status(403).json({ error: "Only group admin can update group info" });
    }

    if (name) group.name = name;

    if (groupImage) {
      const uploadResponse = await cloudinary.uploader.upload(groupImage, { resource_type: "image" });
      group.groupImage = uploadResponse.secure_url;
    }

    await group.save();

    res.status(200).json(group);
  } catch (error) {
    console.error("Error in updateGroupInfo controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getGroupDetails = async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId).populate("members", "-password").populate("admin", "-password");

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    res.status(200).json(group);
  } catch (error) {
    console.error("Error in getGroupDetails controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};