import mongoose from 'mongoose';

const { Schema } = mongoose;

const Photo = new Schema({
  data: Buffer,
  contentType: String,
  updatedAt: Date,
}, { _id: false });

// A saved player: one of the dorm members who get leaderboard stats and show up in match setup.
const Player = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 30 },
  nameKey: { type: String, required: true, unique: true }, // lowercased, whitespace-collapsed name
  aliases: { type: [String], default: [] },                // nameKeys used before a rename, so past matches still count
  photo: Photo,                                            // the face shown in the leaderboard circles
  order: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model('Player', Player);
