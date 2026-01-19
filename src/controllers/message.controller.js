import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import Chat from "../models/chat.model.js";
import Group from "../models/group.model.js";

import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import { sendPushNotification } from "./notification.controller.js";

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    // Fetch all users except the logged-in user
    const users = await User.find({ _id: { $ne: loggedInUserId } }).select("-password");

    // Fetch existing private chats
    const privateChats = await Chat.find({
      chatType: "private",
      participants: loggedInUserId,
    }).populate({
        path: "messages",
        model: "Message",
        options: { limit: 1, sort: { createdAt: -1 } }, // Optimize: only get last message
      });

    // Fetch group chats
    const groupChats = await Chat.find({
      chatType: "group",
      participants: loggedInUserId,
    })
      .populate("group")
      .populate({
        path: "messages",
        model: "Message",
        options: { limit: 1, sort: { createdAt: -1 } },
      });
      
    // Map users to sidebar format
    const privateChatList = users.map((user) => {
       const existingChat = privateChats.find(chat => 
         chat.participants.some(p => p.toString() === user._id.toString())
       );
       
       return {
         _id: user._id, // User ID for private chats
         chatId: existingChat ? existingChat._id : null,
         chatType: "private",
         participant: user,
         lastMessage: existingChat && existingChat.messages && existingChat.messages.length > 0
            ? existingChat.messages[0] 
            : null
       }
    });

    // Map group chats
    const groupChatList = groupChats.map((chat) => ({
      _id: chat.group._id, // Group ID for group chats
      chatId: chat._id,
      chatType: "group",
      group: chat.group,
      lastMessage: chat.messages && chat.messages.length > 0 ? chat.messages[0] : null
    }));

    // Combine and sort (optional: sort by last message time?)
    // For now, groups first, then users, or mix? 
    // Usually sorted by lastActive. 
    // Let's just return [...groupChatList, ...privateChatList]
    
    // Better: Sort by lastMessage.createdAt
    const allChats = [...groupChatList, ...privateChatList].sort((a, b) => {
        const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt) : new Date(0);
        const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt) : new Date(0);
        return timeB - timeA;
    });

    res.status(200).json(allChats);
  } catch (error) {
    console.error("Error in getUsersForSidebar: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const { chatType } = req.query; // 'private' or 'group'
    const myId = req.user._id;

    let chat;

    if (chatType === "group") {
        chat = await Chat.findOne({ group: userToChatId, chatType: "group" }).populate({
            path: "messages",
            model: "Message",
            populate: { path: "senderId", model: "User", select: "-password" },
        });
    } else {
         // Default to private if no chatType or chatType is private
         chat = await Chat.findOne({
            chatType: "private",
            participants: { $all: [myId, userToChatId] },
         }).populate({
            path: "messages",
            model: "Message",
            populate: { path: "senderId", model: "User", select: "-password" },
         });
    }

    if (!chat) {
      // If no chat exists yet (new conversation), return empty array
      return res.status(200).json([]);
    }

    // Mark messages as read by the current user
    await Message.updateMany(
      { _id: { $in: chat.messages.map((msg) => msg._id) }, senderId: { $ne: myId }, readBy: { $ne: myId } },
      { $addToSet: { readBy: myId } }
    );

    res.status(200).json(chat.messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, file, fileType } = req.body;
    const { id: receiverId } = req.params; // For private chats, this is the other user's ID. For group chats, this will be the groupId.
    const { chatType } = req.query; // 'private' or 'group'
    const senderId = req.user._id;

    let chat;
    let receiverSocketIds = [];

    if (chatType === "private") {
      chat = await Chat.findOne({
        chatType: "private",
        participants: { $all: [senderId, receiverId] },
      });

      if (!chat) {
        chat = await Chat.create({
          chatType: "private",
          participants: [senderId, receiverId],
        });
      }
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (receiverSocketId) {
        receiverSocketIds.push(receiverSocketId);
      }
    } else if (chatType === "group") {
      chat = await Chat.findOne({ group: receiverId, chatType: "group" });

      if (!chat) {
        return res.status(404).json({ error: "Group chat not found" });
      }

      const group = await Group.findById(receiverId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      // Get socket IDs of all group members except the sender
      group.members.forEach((memberId) => {
        if (memberId.toString() !== senderId.toString()) {
          const socketId = getReceiverSocketId(memberId);
          if (socketId) {
            receiverSocketIds.push(socketId);
          }
        }
      });
    } else {
      return res.status(400).json({ error: "Invalid chatType" });
    }

    let fileUrl = null;
    if (file) {
      const uploadOptions = {};
      if (fileType === "image") {
        uploadOptions.resource_type = "image";
      } else if (fileType === "video") {
        uploadOptions.resource_type = "video";
      } else if (fileType === "audio") {
        uploadOptions.resource_type = "video"; // Cloudinary treats audio as video resource type
      } else {
        uploadOptions.resource_type = "auto"; // For other file types (documents, etc.)
      }

      const uploadResponse = await cloudinary.uploader.upload(file, uploadOptions);
      fileUrl = uploadResponse.secure_url;
    }

    const newMessage = new Message({
      senderId,
      chatId: chat._id,
      text,
      file: fileUrl,
      fileType,
      readBy: [senderId],
    });

    await newMessage.save();

    chat.messages.push(newMessage._id);
    await chat.save();

    // Populate senderId for socket emission
    await newMessage.populate("senderId", "-password");

    if (receiverSocketIds.length > 0) {
      receiverSocketIds.forEach((socketId) => {
        io.to(socketId).emit("newMessage", newMessage);
      });
    }

    // Send push notifications
    const sender = req.user.fullName;
    const notificationTitle = chatType === "private" ? `New message from ${sender}` : `New message in ${chat.group.name} from ${sender}`;
    const notificationBody = text || "Sent a file";
    const notificationPayload = { title: notificationTitle, body: notificationBody, icon: "/vite.svg", data: { chatId: chat._id } };

    if (chatType === "private") {
      const receiverUser = await User.findById(receiverId);
      if (receiverUser && receiverUser.pushSubscription && !receiverSocketIds.some(socketId => io.sockets.sockets.get(socketId)?.connected)) {
        await sendPushNotification(receiverId, notificationPayload);
      }
    } else if (chatType === "group") {
      const groupMembers = await User.find({ _id: { $in: chat.participants } });
      for (const member of groupMembers) {
        if (member._id.toString() !== senderId.toString() && member.pushSubscription && !receiverSocketIds.some(socketId => io.sockets.sockets.get(socketId)?.connected)) {
          await sendPushNotification(member._id, notificationPayload);
        }
      }
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { text } = req.body;
    const userId = req.user._id;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (message.senderId.toString() !== userId.toString()) {
      return res.status(403).json({ error: "You can only edit your own messages" });
    }

    message.text = text;
    await message.save();

    // Populate senderId before emitting
    await message.populate("senderId", "-password");

    const chat = await Chat.findById(message.chatId).populate("participants");
    if (!chat) {
      return res.status(404).json({ error: "Chat not found for message" });
    }

    // Emit to all participants in the chat
    chat.participants.forEach((participantId) => {
      const participantSocketId = getReceiverSocketId(participantId);
      if (participantSocketId) {
        io.to(participantSocketId).emit("messageUpdated", message);
      }
    });

    res.status(200).json(message);
  } catch (error) {
    console.log("Error in editMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (message.senderId.toString() !== userId.toString()) {
      return res.status(403).json({ error: "You can only delete your own messages" });
    }

    // Remove message from the chat
    await Chat.updateOne({ _id: message.chatId }, { $pull: { messages: messageId } });

    await Message.deleteOne({ _id: messageId });

    const chat = await Chat.findById(message.chatId).populate("participants");
    if (!chat) {
      return res.status(404).json({ error: "Chat not found for message" });
    }

    // Emit to all participants in the chat
    chat.participants.forEach((participantId) => {
      const participantSocketId = getReceiverSocketId(participantId);
      if (participantSocketId) {
        io.to(participantSocketId).emit("messageDeleted", { messageId });
      }
    });

    res.status(200).json({ message: "Message deleted successfully" });
  } catch (error) {
    console.log("Error in deleteMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const reactToMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    const existingReactionIndex = message.reactions.findIndex(
      (reaction) => reaction.userId.toString() === userId.toString() && reaction.emoji === emoji
    );

    if (existingReactionIndex !== -1) {
      // User already reacted with this emoji, so remove it
      message.reactions.splice(existingReactionIndex, 1);
    } else {
      // Add new reaction
      message.reactions.push({ userId, emoji });
    }

    await message.save();

    const chat = await Chat.findById(message.chatId).populate("participants");
    if (!chat) {
      return res.status(404).json({ error: "Chat not found for message" });
    }

    // Emit to all participants in the chat
    chat.participants.forEach((participantId) => {
      const participantSocketId = getReceiverSocketId(participantId);
      if (participantSocketId) {
        io.to(participantSocketId).emit("messageReacted", message);
      }
    });

    res.status(200).json(message);
  } catch (error) {
    console.log("Error in reactToMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
