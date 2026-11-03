---
name: PostgreSQL array result types
description: Node-postgres array parsing for catalog fields and aggregated text values.
---

When querying PostgreSQL catalog arrays through node-postgres, cast values to the intended type or use `json_agg` when JavaScript needs a JSON array. Array-like results can arrive as brace-delimited strings rather than JavaScript arrays.

**Why:** Both `pg_policies.roles` and a catalog `array_agg(text)` result caused JavaScript array operations to misread the returned value.

**How to apply:** Check the real driver result shape in tests; cast policy role arrays to `text[]` and prefer `json_agg` for SQL-generated lists consumed as JavaScript arrays.
