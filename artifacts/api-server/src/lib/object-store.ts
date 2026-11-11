import { withOrg } from "@workspace/db";

/**
 * Private file storage: files are kept as bytea rows in school.stored_files
 * (migration school:004) so every deployment mode — standalone server or
 * embedded in the Next.js app — works without external object storage.
 * All access goes through withOrg so the tenant RLS policy applies.
 */

export async function storeFile(input: {
  orgId: string;
  objectName: string;
  contentType: string;
  bytes: Buffer;
}): Promise<void> {
  await withOrg(input.orgId, (client) =>
    client.query(
      `INSERT INTO school.stored_files (object_name, org_id, content_type, bytes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (object_name) DO NOTHING`,
      [input.objectName, input.orgId, input.contentType, input.bytes],
    ),
  );
}

export async function readFile(input: {
  orgId: string;
  objectName: string;
}): Promise<{ contentType: string; bytes: Buffer } | null> {
  const result = await withOrg(input.orgId, (client) =>
    client.query<{ content_type: string; bytes: Buffer }>(
      "SELECT content_type, bytes FROM school.stored_files WHERE org_id = $1 AND object_name = $2",
      [input.orgId, input.objectName],
    ),
  );
  const row = result.rows[0];
  return row ? { contentType: row.content_type, bytes: row.bytes } : null;
}

export async function deleteFile(input: {
  orgId: string;
  objectName: string;
}): Promise<void> {
  await withOrg(input.orgId, (client) =>
    client.query("DELETE FROM school.stored_files WHERE org_id = $1 AND object_name = $2", [
      input.orgId,
      input.objectName,
    ]),
  );
}
