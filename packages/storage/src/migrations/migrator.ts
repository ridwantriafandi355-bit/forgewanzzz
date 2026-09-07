import { ForgeDatabase } from "../database.js";
import { SCHEMA_V1 } from "./schema-v1.js";

export function runMigrations(db: ForgeDatabase): void {
  db.getRawDb().exec(SCHEMA_V1);
}
