// tests/auth.test.js
const request = require('supertest');
const { app } = require('../server');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

describe('Authentication Endpoints', () => {
  // Clean up after tests
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('POST /api/auth/signup - should create a new user', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .send({
        email: 'test@example.com',
        name: 'Test User',
        password: 'Password123!',
      });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('token');
    expect(response.body.user).toHaveProperty('email', 'test@example.com');
  });

  test('POST /api/auth/login - should login user', async () => {
    // Create user first
    await request(app)
      .post('/api/auth/signup')
      .send({
        email: 'login@example.com',
        name: 'Login Test',
        password: 'Password123!',
      });

    // Login
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'login@example.com',
        password: 'Password123!',
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
  });

  test('POST /api/auth/signup - should reject duplicate email', async () => {
    const userData = {
      email: 'duplicate@example.com',
      name: 'User 1',
      password: 'Password123!',
    };

    // Create first user
    await request(app).post('/api/auth/signup').send(userData);

    // Try to create duplicate
    const response = await request(app)
      .post('/api/auth/signup')
      .send(userData);

    expect(response.status).toBe(409);
    expect(response.body).toHaveProperty('error');
  });

  test('POST /api/auth/login - should reject wrong password', async () => {
    // Create user
    await request(app)
      .post('/api/auth/signup')
      .send({
        email: 'wrongpass@example.com',
        name: 'Wrong Pass User',
        password: 'CorrectPassword123!',
      });

    // Login with wrong password
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'wrongpass@example.com',
        password: 'WrongPassword123!',
      });

    expect(response.status).toBe(401);
  });

  test('POST /api/auth/logout - should logout user', async () => {
    // Create and login
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        email: 'logout@example.com',
        name: 'Logout User',
        password: 'Password123!',
      });

    const token = signupRes.body.token;

    // Logout
    const response = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Logged out successfully');
  });
});

describe('Health Check', () => {
  test('GET /api/health - should return OK status', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'OK');
  });
});
