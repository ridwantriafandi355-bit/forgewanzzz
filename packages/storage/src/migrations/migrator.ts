import { ForgeDatabase } from "../database.js";
import { SCHEMA_V1 } from "./schema-v1.js";
import { SCHEMA_V2 } from "./schema-v2.js";

export function runMigrations(db: ForgeDatabase): void {
  const raw = db.getRawDb();
  raw.exec(SCHEMA_V1);
  raw.exec(SCHEMA_V2);
}
