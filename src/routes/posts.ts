import { Router } from "express";
import { pool } from "../db";

const router = Router();

router.post("/", async (req, res) => {
try {
const { userId, title, content } = req.body;

```
if (!userId || !title || !content) {
  return res.status(400).json({
    error: "userId, title and content are required",
  });
}

const result = await pool.query(
  `
  INSERT INTO posts (user_id, title, content)
  VALUES ($1, $2, $3)
  RETURNING *
  `,
  [userId, title, content]
);

res.status(201).json({
  post: result.rows[0],
});
```

} catch (error) {
console.error(error);

```
res.status(500).json({
  error: "internal server error",
});
```

}
});

router.get("/", async (_req, res) => {
try {
const result = await pool.query(`       SELECT *
      FROM posts
      ORDER BY created_at DESC
    `);

```
res.json({
  posts: result.rows,
});
```

} catch (error) {
console.error(error);

```
res.status(500).json({
  error: "internal server error",
});
```

}
});

router.get("/:id", async (req, res) => {
try {
const result = await pool.query(
`       SELECT *
      FROM posts
      WHERE id = $1
      `,
[req.params.id]
);

```
if (result.rows.length === 0) {
  return res.status(404).json({
    error: "post not found",
  });
}

res.json({
  post: result.rows[0],
});
```

} catch (error) {
console.error(error);

```
res.status(500).json({
  error: "internal server error",
});
```

}
});

export default router;
