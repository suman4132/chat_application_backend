import { Server } from "socket.io";
import http from "http";
import express from "express";
import Group from "../models/group.model.js"; // Import Group model

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173"],
  },
});

export function getReceiverSocketId(userId) {
  return userSocketMap[userId];
}

// used to store online users
const userSocketMap = {}; // {userId: socketId}

io.on("connection", (socket) => {
  console.log("A user connected", socket.id);

  const userId = socket.handshake.query.userId;
  if (userId) userSocketMap[userId] = socket.id;

  // io.emit() is used to send events to all the connected clients
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // Listen for typing event
  socket.on("typing", ({ receiverId }) => {
    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("typing", { senderId: userId });
    }
  });

  // Listen for stopTyping event
  socket.on("stopTyping", ({ receiverId }) => {
    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("stopTyping", { senderId: userId });
    }
  });

  // Listen for message read event
  socket.on("messageRead", ({ senderId, receiverId, messageIds }) => {
    const senderSocketId = getReceiverSocketId(senderId);
    if (senderSocketId) {
      io.to(senderSocketId).emit("messageRead", { receiverId, messageIds });
    }
  });

  // Call Events
  socket.on("callUser", ({ userToCall, signalData, from, name }) => {
    const receiverSocketId = getReceiverSocketId(userToCall);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("callUser", { signal: signalData, from, name });
    }
  });

  socket.on("answerCall", (data) => {
    const receiverSocketId = getReceiverSocketId(data.to);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("callAccepted", data.signal);
    }
  });

  socket.on("endCall", async ({ to }) => {
    const receiverSocketId = getReceiverSocketId(to);
    if (receiverSocketId) {
        io.to(receiverSocketId).emit("callEnded");
    }
    // ... (existing logging logic commented out)
  });

  // Group Call Notification: Ring Everyone
  socket.on("start-group-call", async ({ groupId, callerName, callerId }) => {
      try {
          const group = await Group.findById(groupId);
          if (group && group.members) {
              group.members.forEach(memberId => {
                  if (memberId.toString() !== callerId) {
                      const receiverSocketId = getReceiverSocketId(memberId.toString());
                      if (receiverSocketId) {
                          io.to(receiverSocketId).emit("incoming-group-call", {
                              groupId,
                              callerName,
                              callerId,
                              groupName: group.name
                          });
                      }
                  }
              });
          }
      } catch (error) {
          console.error("Error starting group call:", error);
      }
  });

  socket.on("join-room", (roomId, userId) => {
    socket.join(roomId);
    socket.to(roomId).emit("user-connected", userId);

    socket.on("disconnect", () => {
        socket.to(roomId).emit("user-disconnected", userId);
    });
  });

  socket.on("sending-signal", (payload) => {
    const receiverSocketId = getReceiverSocketId(payload.userToSignal);
    if(receiverSocketId) {
        io.to(receiverSocketId).emit("user-joined", { signal: payload.signal, callerID: payload.callerID });
    }
  });

  socket.on("returning-signal", (payload) => {
      const receiverSocketId = getReceiverSocketId(payload.callerID);
      if(receiverSocketId) {
          io.to(receiverSocketId).emit("receiving-returned-signal", { signal: payload.signal, id: socket.handshake.query.userId });
      }
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected", socket.id);
    delete userSocketMap[userId];
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
    // Ideally notify active call partners here, but basic implementation relies on simple-peer close
  });
});

export { io, app, server };
