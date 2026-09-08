import { join } from "node:path";
import { ForgeDatabase, runMigrations, MemoryRepository, type MemoryRecord } from "@forge/storage";
import { SemanticMemoryEngine } from "@forge/memory";

export interface MemoryCommandOptions {
  subcommand?: "search" | "list" | "store";
  query?: string;
  scopeType?: string;
  scopeId?: string;
  category?: string;
  title?: string;
  content?: string;
  tags?: string;
  json?: boolean;
  dbPath?: string;
}

export interface MemoryCommandResult {
  items: MemoryRecord[];
  count: number;
  message?: string;
}

export async function memoryCommand(
  opts: MemoryCommandOptions = {}
): Promise<MemoryCommandResult> {
  const dbPath = opts.dbPath || join(process.cwd(), ".forge", "forge.db");
  const db = new ForgeDatabase(dbPath);
  runMigrations(db);

  const repo = new MemoryRepository(db);
  const engine = new SemanticMemoryEngine(repo);
  const subcommand = opts.subcommand || (opts.query ? "search" : "list");

  try {
    if (subcommand === "store") {
      if (!opts.content) {
        throw new Error("Content is required to store memory (--content '...')");
      }

      const tags = opts.tags ? opts.tags.split(",").map((t) => t.trim()) : [];
      const record = repo.store({
        scopeType: (opts.scopeType as any) || "PROJECT",
        scopeId: opts.scopeId || "default",
        category: (opts.category as any) || "LEARNING",
        title: opts.title,
        content: opts.content,
        tags,
      });

      if (opts.json) {
        console.log(JSON.stringify(record, null, 2));
      } else {
        console.log(`\n[SUCCESS] Memory stored with ID: ${record.id}`);
        console.log(`Scope: ${record.scopeType}:${record.scopeId} | Category: ${record.category}`);
        console.log(`Title: ${record.title || "(Untitled)"}`);
        console.log(`Content: ${record.content}\n`);
      }

      return { items: [record], count: 1, message: "Memory stored successfully" };
    }

    if (subcommand === "search") {
      if (!opts.query) {
        throw new Error("Search query is required (--query '...')");
      }

      const results = engine.recall({
        query: opts.query,
        scopeType: opts.scopeType as any,
        scopeId: opts.scopeId,
        category: opts.category as any,
      });

      if (opts.json) {
        console.log(JSON.stringify({ items: results, count: results.length }, null, 2));
      } else {
        console.log(`\n======================= FORGE MEMORY RECALL =======================`);
        console.log(`Query: "${opts.query}" | Matches: ${results.length}`);
        console.log(`-------------------------------------------------------------------`);

        if (results.length === 0) {
          console.log("  (No relevant memories found)");
        } else {
          for (const item of results) {
            const scope = `[${item.scopeType}:${item.scopeId}]`.padEnd(20);
            const cat = `[${item.category}]`.padEnd(12);
            console.log(`${scope} ${cat} ${item.title || item.id}`);
            const preview = item.content.length > 80 ? `${item.content.slice(0, 77)}...` : item.content;
            console.log(`    Content: ${preview}`);
            if (item.tags.length > 0) {
              console.log(`    Tags: ${item.tags.join(", ")}`);
            }
            console.log("");
          }
        }
        console.log(`===================================================================\n`);
      }

      return { items: results, count: results.length };
    }

    // Default: list
    const scopeType = (opts.scopeType as any) || "PROJECT";
    const scopeId = opts.scopeId || "default";
    let records = repo.listByScope(scopeType, scopeId);

    // If no records in default scope, query without scope filter via FTS wildcard or all records
    if (records.length === 0 && !opts.scopeId) {
      const rawDb = db.getRawDb();
      const allRows = rawDb.prepare("SELECT * FROM memory_records ORDER BY created_at DESC LIMIT 20").all() as any[];
      records = allRows.map((r: any) => ({
        id: r.id,
        scopeType: r.scope_type,
        scopeId: r.scope_id,
        category: r.category,
        title: r.title || undefined,
        content: r.content,
        tags: r.tags ? JSON.parse(r.tags) : [],
        metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
        embedding: r.embedding ? JSON.parse(r.embedding) : undefined,
        tokenCount: r.token_count,
        accessCount: r.access_count,
        lastAccessedAt: r.last_accessed_at || null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    }

    if (opts.json) {
      console.log(JSON.stringify({ items: records, count: records.length }, null, 2));
    } else {
      console.log(`\n======================= FORGE MEMORY VAULT =======================`);
      console.log(`Stored Knowledge Entries: ${records.length}`);
      console.log(`------------------------------------------------------------------`);

      if (records.length === 0) {
        console.log("  (Vault empty - no memories registered)");
      } else {
        for (const item of records) {
          const scope = `[${item.scopeType}:${item.scopeId}]`.padEnd(20);
          const cat = `[${item.category}]`.padEnd(12);
          console.log(`${scope} ${cat} ${item.title || item.id}`);
          const preview = item.content.length > 70 ? `${item.content.slice(0, 67)}...` : item.content;
          console.log(`    ${preview}`);
        }
      }
      console.log(`==================================================================\n`);
    }

    return { items: records, count: records.length };
  } finally {
    db.close();
  }
}
