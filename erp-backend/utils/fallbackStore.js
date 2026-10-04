const crypto = require('crypto');
const bcrypt = require('bcryptjs');

function genId() { return crypto.randomUUID(); }

const store = {
  users: [],
  courses: [],
  semesters: [],
  subjects: [],
  attendance: [],
  marks: [],
  notices: []
};

async function initFallbackSeed() {
  if (store.users.length > 0) return;
  // Admin
  store.users.push({
    _id: genId(),
    name: 'Super Admin',
    email: 'admin@erp.edu',
    password: await bcrypt.hash('admin123', 10),
    role: 'admin',
    department: 'Administration',
    enrollmentNo: null,
    employeeId: 'ADM001',
    course: null,
    semester: null,
    createdAt: new Date()
  });
  store.users.push({
    _id: genId(),
    name: 'Dr. Sharma',
    email: 'faculty@erp.edu',
    password: await bcrypt.hash('faculty123', 10),
    role: 'faculty',
    department: 'CSE',
    employeeId: 'FAC001',
    course: null,
    semester: null,
    createdAt: new Date()
  });
  store.users.push({
    _id: genId(),
    name: 'Sanskar Patel',
    email: 'student@erp.edu',
    password: await bcrypt.hash('student123', 10),
    role: 'student',
    department: 'CSE',
    enrollmentNo: 'STU2025001',
    employeeId: null,
    course: null,
    semester: 1,
    createdAt: new Date()
  });
  const c1 = { _id: genId(), name: 'B.Tech', code: 'BTECH', description: 'Bachelor of Technology', durationYears: 4, createdAt: new Date() };
  const c2 = { _id: genId(), name: 'MCA', code: 'MCA', description: 'Master of Computer Applications', durationYears: 3, createdAt: new Date() };
  store.courses.push(c1, c2);
  const s1 = { _id: genId(), name: 'Semester 1', number: 1, course: c1._id, createdAt: new Date() };
  const s2 = { _id: genId(), name: 'Semester 2', number: 2, course: c1._id, createdAt: new Date() };
  store.semesters.push(s1, s2);
  const sub1 = { _id: genId(), name: 'Data Structures', code: 'CS101', course: c1._id, semester: s1._id, faculty: store.users[1]._id, credits: 4, createdAt: new Date() };
  const sub2 = { _id: genId(), name: 'DBMS', code: 'CS102', course: c1._id, semester: s1._id, faculty: store.users[1]._id, credits: 3, createdAt: new Date() };
  store.subjects.push(sub1, sub2);
  // link student course
  store.users[2].course = c1._id;
  store.notices.push({
    _id: genId(),
    title: 'Welcome to New Academic Session 2026',
    content: 'Classes commence from 1st Oct 2026. All students are requested to complete enrollment.',
    audience: 'all',
    pinned: true,
    createdBy: store.users[0]._id,
    createdAt: new Date()
  });
  // sample attendance
  const today = new Date().toISOString().slice(0,10);
  store.attendance.push({ _id: genId(), subject: sub1._id, student: store.users[2]._id, date: today, status: 'present', markedBy: store.users[1]._id, createdAt: new Date() });
  store.marks.push({ _id: genId(), subject: sub1._id, student: store.users[2]._id, examType: 'Quiz', maxMarks: 20, obtained: 16, grade: 'A', createdAt: new Date() });
  console.log('[Fallback] Seed data initialized');
}

module.exports = { store, genId, initFallbackSeed };
