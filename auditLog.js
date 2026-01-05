const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: ['login', 'logout', 'create', 'update', 'delete', 'approve', 'reject', 'pay']
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  user_name: {
    type: String,
    required: true
  },
  user_role: {
    type: String,
    required: true
  },
  entity_type: {
    type: String,
    enum: ['user', 'claim', 'system']
  },
  entity_id: {
    type: String
  },
  details: {
    type: String
  },
  ip_address: {
    type: String
  },
  user_agent: {
    type: String
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Index for faster queries
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ user_id: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);