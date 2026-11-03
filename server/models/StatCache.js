import mongoose from 'mongoose';

const { Schema } = mongoose;

// One document: a counter that goes up whenever something that feeds the stats changes
// (a finished match saved / edited / deleted, a player added / renamed / removed, an import).
export const StatMeta = mongoose.model('StatMeta', new Schema({
  key: { type: String, unique: true, default: 'stats' },
  version: { type: Number, default: 0 },
}));

// Finished results of the Leaderboards, Home and 1v1 calculations, each stamped with the counter value it was built at.
export const StatCache = mongoose.model('StatCache', new Schema({
  key: { type: String, unique: true, required: true },
  version: { type: Number, required: true },
  value: Schema.Types.Mixed,
  computedAt: { type: Date, default: Date.now },
}));
