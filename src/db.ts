import { SQL } from "bun";
import { config } from "./config";

export const sql = new SQL({
  url: config.databaseUrl,
  max: config.dbPoolMax,
  idleTimeout: 30,
  connectionTimeout: 10,
});
