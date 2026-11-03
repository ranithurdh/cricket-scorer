import mongoose from 'mongoose';

const { Schema } = mongoose;

const Image = new Schema({
  data: Buffer,
  contentType: String,
  updatedAt: Date,
}, { _id: false });

// A single document (key: 'site') holding the site-wide look: background image + tab icon.
const Settings = new Schema({
  key: { type: String, unique: true, default: 'site' },
  background: Image,
  icon: Image,
  backgroundOpacity: { type: Number, min: 0, max: 100, default: 60 }, // % of the background image that shows through
  playersSeeded: { type: Boolean, default: false }, // the default roster has been copied into the players collection once
}, { timestamps: true });

export default mongoose.model('Settings', Settings);
