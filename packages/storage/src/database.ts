import { DatabaseSync } from "node:sqlite";

export class ForgeDatabase {
  private db: DatabaseSync;

  constructor(filePath: string = ":memory:") {
    this.db = new DatabaseSync(filePath);
    this.configurePragmas();
  }

  private configurePragmas(): void {
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.db.exec("PRAGMA foreign_keys = ON;");
  }

  getRawDb(): DatabaseSync {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}
