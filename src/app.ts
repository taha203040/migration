import express from "express";
import authRoutes from "./routes/auth";
import postRoutes from "./routes/posts";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
res.json({ status: "ok" });
});

app.use("/auth", authRoutes);
app.use("/posts", postRoutes);

export default app;
