import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { hasForeignKeyReferences } from "./foreign-key-usage.ts";

test("foreign-key usage check returns false when there are no referencing constraints", async () => {
  const client = {
    query: async () => ({ rows: [] }),
  } as unknown as Pick<PoolClient, "query">;

  assert.equal(await hasForeignKeyReferences(client, "academic", "sections", { id: "section-id" }), false);
});

test("foreign-key usage check binds parent values and safely quotes catalog identifiers", async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (sql.includes("pg_constraint")) {
        return {
          rows: [{
            child_schema: 'school"records',
            child_table: 'attendance"marks',
            child_columns: ["section_id"],
            parent_columns: ["id"],
          }],
        };
      }
      return { rows: [{ referenced: true }] };
    },
  } as unknown as Pick<PoolClient, "query">;

  assert.equal(await hasForeignKeyReferences(client, "academic", "sections", { id: "section-id" }), true);
  assert.equal(calls[1]?.values?.[0], "section-id");
  assert.match(calls[1]?.sql ?? "", /"school""records"\."attendance""marks"/);
  assert.doesNotMatch(calls[1]?.sql ?? "", /school"records/);
});

test("foreign-key usage check can ignore a known structural relationship", async () => {
  const calls: string[] = [];
  const client = {
    query: async (sql: string) => {
      calls.push(sql);
      return {
        rows: [{
          child_schema: "academic",
          child_table: "sections",
          child_columns: ["class_id"],
          parent_columns: ["id"],
        }],
      };
    },
  } as unknown as Pick<PoolClient, "query">;

  assert.equal(
    await hasForeignKeyReferences(client, "academic", "classes", { id: "class-id" }, ["academic.sections"]),
    false,
  );
  assert.equal(calls.length, 1);
});
