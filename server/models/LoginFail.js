import mongoose from 'mongoose';

// Wrong-password counter per address, kept in the database (not memory) so it works across serverless instances.
// MongoDB deletes each row by itself once `until` has passed.
export default mongoose.model('LoginFail', new mongoose.Schema({
  ip: { type: String, unique: true, required: true },
  n: { type: Number, default: 0 },
  until: { type: Date, required: true, expires: 0 },
}));
