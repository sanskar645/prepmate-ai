const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin','faculty','student'], required: true },
  department: String,
  enrollmentNo: String,
  employeeId: String,
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  semester: Number,
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
