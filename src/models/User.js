const bcrypt = require('bcryptjs');
const { mongoose } = require('../db');

/**
 * A customer account.
 *
 * Accounts are optional — guest checkout stays. What an account buys you is
 * order history, a saved address, and the interests that drive the
 * recommendation rail.
 *
 * The password is never stored. `passwordHash` holds a bcrypt hash and is
 * excluded from queries by default (`select: false`), so you have to ask for it
 * explicitly. That makes it hard to leak it into an API response by accident.
 */
const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'That does not look like an email address.'],
    },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, default: '', trim: true },
    phone: { type: String, default: '' },

    /** Picked at signup. Seeds the recommendation rail before there is history. */
    interests: {
      type: [String],
      default: [],
      validate: {
        validator: (v) => v.every((s) => ['biker', 'tabletop', 'daily'].includes(s)),
        message: 'Interests must be category slugs.',
      },
    },

    address: {
      line1: { type: String, default: '' },
      city: { type: String, default: '' },
      pincode: { type: String, default: '' },
    },

    role: { type: String, enum: ['customer', 'staff'], default: 'customer' },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/** Cost factor 10 — about 50-100 ms per hash, slow enough to matter, fast enough for a login. */
const ROUNDS = 10;

UserSchema.statics.hashPassword = function (plain) {
  return bcrypt.hash(plain, ROUNDS);
};

UserSchema.methods.verifyPassword = function (plain) {
  if (!this.passwordHash) throw new Error('passwordHash was not selected on this document.');
  return bcrypt.compare(plain, this.passwordHash);
};

/** What is safe to send to a browser. */
UserSchema.methods.toPublic = function () {
  return {
    id: this._id,
    email: this.email,
    name: this.name,
    phone: this.phone,
    interests: this.interests,
    address: this.address,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
