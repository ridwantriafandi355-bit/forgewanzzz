import { ForgeDatabase } from "../database.js";
import { SCHEMA_V1 } from "./schema-v1.js";
import { SCHEMA_V2 } from "./schema-v2.js";
import { SCHEMA_V3 } from "./schema-v3.js";
import { SCHEMA_V4 } from "./schema-v4.js";
import { SCHEMA_V5 } from "./schema-v5.js";

export function runMigrations(db: ForgeDatabase): void {
  const raw = db.getRawDb();
  raw.exec(SCHEMA_V1);
  raw.exec(SCHEMA_V2);
  raw.exec(SCHEMA_V3);
  raw.exec(SCHEMA_V4);
  raw.exec(SCHEMA_V5);
}

