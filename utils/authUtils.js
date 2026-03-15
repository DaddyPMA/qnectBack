// utils/authUtils.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const hashPassword = async (password) => {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
};

const comparePasswords = async (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

const generateToken = (userId, expiresIn = '2 weeks') => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn });
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

module.exports = {
  hashPassword,
  comparePasswords,
  generateToken,
  verifyToken,
};
