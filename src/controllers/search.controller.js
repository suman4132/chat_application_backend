// backend/src/controllers/search.controller.js
import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import Chat from "../models/chat.model.js";

export const searchUsersAndMessages = async (req, res) => {
  try {
    const { query } = req.query;
    const userId = req.user._id;

    if (!query) {
      return res.status(400).json({ error: "Search query cannot be empty" });
    }

    // Search for users
    const users = await User.find({
      _id: { $ne: userId }, // Exclude the current user
      $or: [
        { fullName: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
      ],
    }).select("-password");

    // Search for messages within chats the user is a part of
    const userChats = await Chat.find({ participants: userId });
    const chatIds = userChats.map((chat) => chat._id);

    const messages = await Message.find({
      chatId: { $in: chatIds },
      text: { $regex: query, $options: "i" },
    }).populate("senderId", "-password");

    res.status(200).json({ users, messages });
  } catch (error) {
    console.error("Error in searchUsersAndMessages: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
