import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import helmet from "helmet";
import morgan from "morgan";

import { connectDB } from "./lib/db.js";
import authRoutes from "./routes/auth.route.js";
import messageRoutes from "./routes/message.route.js";
import groupRoutes from "./routes/group.route.js";
import notificationRoutes from "./routes/notification.route.js";
import { app, server } from "./lib/socket.js";

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 5001;
const __dirname = path.resolve();

// ✅ Increase payload size limit (fix for PayloadTooLargeError)
// ✅ Increase payload size limit (fix for PayloadTooLargeError)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(helmet());
app.use(morgan("dev"));

// ✅ Cookie support
app.use(cookieParser());

// ✅ CORS setup to allow frontend access
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://tangerine-biscotti-cdb273.netlify.app",
      "https://teal-phoenix-183758.netlify.app",
      "https://grand-pasca-1c7d55.netlify.app",
    ],
    credentials: true,
  })
);

// ✅ API Routes
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/notifications", notificationRoutes);

// ✅ Serve frontend in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend", "dist", "index.html"));
  });
}

// ✅ Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!", error: process.env.NODE_ENV === "development" ? err.message : undefined });
});

// ✅ Start server and connect to database
server.listen(PORT, () => {
  console.log("Server is running on PORT: " + PORT);
  connectDB();
});
