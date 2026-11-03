import type { PoolClient } from "pg";

type ForeignKeyReference = {
  child_schema: string;
  child_table: string;
  child_columns: string[];
  parent_columns: string[];
};

const quoteIdentifier = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

export async function hasForeignKeyReferences(
  client: Pick<PoolClient, "query">,
  parentSchema: string,
  parentTable: string,
  parentValues: Record<string, unknown>,
  ignoredRelations: string[] = [],
): Promise<boolean> {
  const constraints = await client.query<ForeignKeyReference>(
    `SELECT child_namespace.nspname AS child_schema,
            child_relation.relname AS child_table,
            json_agg(child_attribute.attname ORDER BY child_key.ordinality) AS child_columns,
            json_agg(parent_attribute.attname ORDER BY child_key.ordinality) AS parent_columns
       FROM pg_constraint foreign_key
       JOIN pg_class parent_relation ON parent_relation.oid = foreign_key.confrelid
       JOIN pg_namespace parent_namespace ON parent_namespace.oid = parent_relation.relnamespace
       JOIN pg_class child_relation ON child_relation.oid = foreign_key.conrelid
       JOIN pg_namespace child_namespace ON child_namespace.oid = child_relation.relnamespace
       JOIN LATERAL unnest(foreign_key.conkey) WITH ORDINALITY AS child_key(attnum, ordinality) ON true
       JOIN LATERAL unnest(foreign_key.confkey) WITH ORDINALITY AS parent_key(attnum, ordinality)
         ON parent_key.ordinality = child_key.ordinality
       JOIN pg_attribute child_attribute
         ON child_attribute.attrelid = foreign_key.conrelid AND child_attribute.attnum = child_key.attnum
       JOIN pg_attribute parent_attribute
         ON parent_attribute.attrelid = foreign_key.confrelid AND parent_attribute.attnum = parent_key.attnum
      WHERE foreign_key.contype = 'f'
        AND parent_namespace.nspname = $1
        AND parent_relation.relname = $2
      GROUP BY foreign_key.oid, child_namespace.nspname, child_relation.relname`,
    [parentSchema, parentTable],
  );

  for (const reference of constraints.rows) {
    const relation = `${reference.child_schema}.${reference.child_table}`;
    if (ignoredRelations.includes(relation)) continue;

    const values = reference.parent_columns.map((column) => parentValues[column]);
    if (values.some((value) => value === undefined)) {
      throw new Error(`Missing referenced key while checking ${relation}.`);
    }
    const predicates = reference.child_columns
      .map((column, index) => `${quoteIdentifier(column)} IS NOT DISTINCT FROM $${index + 1}`)
      .join(" AND ");
    const childTable = `${quoteIdentifier(reference.child_schema)}.${quoteIdentifier(reference.child_table)}`;
    const result = await client.query<{ referenced: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM ${childTable} WHERE ${predicates}) AS referenced`,
      values as (string | number | boolean | null)[],
    );
    if (result.rows[0]?.referenced) return true;
  }

  return false;
}
