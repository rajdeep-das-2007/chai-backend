import mongoose, { Schema } from "mongoose";

const subscriptionSchema = new Schema({
    subscriber: {
        type: Schema.Types.ObjectId, // one who is subscribing (current user is subcribing to a channel)
        ref: "User",
    },
    channel: {
        type: Schema.Types.ObjectId, // one who is being subscribed to (channel owner)
        ref: "User",
    }
}, { timestamps: true })

export const Subscription = mongoose.model("Subscription", subscriptionSchema);