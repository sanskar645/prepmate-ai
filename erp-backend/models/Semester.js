const mongoose = require('mongoose');
const semesterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  number: { type: Number, required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true }
}, { timestamps: true });
module.exports = mongoose.model('Semester', semesterSchema);
