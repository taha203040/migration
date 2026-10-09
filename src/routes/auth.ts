import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db";

const router = Router();

router.post("/signup", async (req, res) => {
try {
const { email, password } = req.body;

if (!email || !password) {
  return res.status(400).json({
    error: "email and password are required",
  });
}

const passwordHash = await bcrypt.hash(password, 10);

const result = await pool.query(
  `
  INSERT INTO users (email, password_hash)
  VALUES ($1, $2)
  RETURNING id, email, created_at
  `,
  [email, passwordHash]
);

res.status(201).json({
  user: result.rows[0],
});

} catch (error) {
console.error(error);

res.status(500).json({
  error: "internal server error",
});

}
});

router.post("/login", async (req, res) => {
try {
const { email, password } = req.body;

const result = await pool.query(
  `
  SELECT id, email, password_hash
  FROM users
  WHERE email = $1
  `,
  [email]
);

if (result.rows.length === 0) {
  return res.status(401).json({
    error: "invalid credentials",
  });
}

const user = result.rows[0];

const validPassword = await bcrypt.compare(
  password,
  user.password_hash
);

if (!validPassword) {
  return res.status(401).json({
    error: "invalid credentials",
  });
}

res.json({
  message: "login successful",
  user: {
    id: user.id,
    email: user.email,
  },
});

} catch (error) {
console.error(error);


res.status(500).json({
  error: "internal server error",
});


}
});

export default router;
