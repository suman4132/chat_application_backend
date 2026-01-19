import User from "../models/user.model.js";
import webpush from "web-push";

// Configure web-push with your VAPID keys
webpush.setVapidDetails(
  "mailto:your_email@example.com", // Replace with your actual email
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export const subscribeToNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const subscription = req.body.subscription;

    if (!subscription) {
      return res.status(400).json({ error: "Push subscription data is required" });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.pushSubscription = subscription;
    await user.save();

    res.status(200).json({ message: "Push subscription saved successfully" });
  } catch (error) {
    console.error("Error in subscribeToNotifications controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendPushNotification = async (userId, payload) => {
  try {
    const user = await User.findById(userId);

    if (!user || !user.pushSubscription) {
      console.log(`User ${userId} or their subscription not found. Skipping push notification.`);
      return;
    }

    await webpush.sendNotification(user.pushSubscription, JSON.stringify(payload));
    console.log(`Push notification sent to user ${userId}`);
  } catch (error) {
    console.error("Error sending push notification: ", error.message);
    // Handle cases where subscription is no longer valid (e.g., delete subscription from DB)
    if (error.statusCode === 410) { // GONE status code
      console.log(`Subscription for user ${userId} is no longer valid. Removing from DB.`);
      await User.updateOne({ _id: userId }, { $set: { pushSubscription: null } });
    }
  }
};