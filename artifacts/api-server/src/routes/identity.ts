import type { FastifyPluginAsync } from "fastify";
import {
  ChangePasswordBody,
  CreateSchoolAdminAccountBody,
  CreateTeacherAccountBody,
  GetSchoolAdminAccountsQueryParams,
  LoginBody,
  ResetPasswordParams,
  UpdateSchoolAdminAccountBody,
  UpdateSchoolAdminAccountParams,
} from "@workspace/api-zod";
import { pool, withOrg } from "@workspace/db";
import { createRouteRegistrar } from "../lib/fastify-routes";
import {
  createAccessToken,
  hashPassword,
  requireAuth,
  requireRoles,
  verifyPassword,
} from "../lib/auth";
import {
  canDeactivateSchoolAdmin,
  canCreateSchoolAdmin,
  canManageUser,
  generateTemporaryPassword,
  isValidNewPassword,
  needsPasswordRehash,
} from "../lib/identity-security";
import {
  clearSessionCookies,
  createCsrfToken,
  createRefreshCredential,
  createSessionCookies,
  hashRefreshSecret,
  hasValidCsrfToken,
  matchesRefreshSecret,
  readRefreshCredential,
  REMEMBERED_SESSION_SECONDS,
} from "../lib/auth-sessions";

const routes: FastifyPluginAsync = async (fastify) => {
const router = createRouteRegistrar(fastify);

function invalid(message: string, code = "INVALID_REQUEST") {
  return { error: { code, message } };
}

router.post("/identity/auth/login", async (req, res, next) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(invalid("Enter a valid organization, email, and password."));
    return;
  }

  try {
    const orgResult = await pool.query<{ id: string; name: string }>(
      "SELECT id, name FROM identity.organizations WHERE slug = $1 LIMIT 1",
      [parsed.data.orgSlug.trim().toLowerCase()],
    );
    const org = orgResult.rows[0];
    if (!org) {
      res.status(401).json(invalid("Invalid organization or credentials.", "INVALID_CREDENTIALS"));
      return;
    }

    const userResult = await withOrg(org.id, async (client) =>
      client.query<{
        id: string;
        org_id: string;
        name: string;
        email: string;
        password_hash: string;
        status: string;
        must_change_password: boolean;
        temporary_password_expires_at: Date | null;
        roles: Array<"super_admin" | "org_admin" | "campus_admin" | "hod" | "teacher" | "class_teacher" | "student" | "parent">;
      }>(
        `SELECT u.id, u.org_id, u.name, u.email, u.password_hash, u.status,
                u.must_change_password, u.temporary_password_expires_at,
                COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
           FROM identity.users AS u
           LEFT JOIN identity.user_roles AS ur
             ON ur.user_id = u.id AND ur.org_id = u.org_id
          WHERE u.org_id = $1 AND lower(u.email) = lower($2)
          GROUP BY u.id`,
        [org.id, parsed.data.email],
      ),
    );
    const user = userResult.rows[0];
    if (
      !user ||
      user.status !== "active" ||
      user.roles.length === 0 ||
       !(await verifyPassword(parsed.data.password, user.password_hash))
    ) {
      res.status(401).json(invalid("Invalid organization or credentials.", "INVALID_CREDENTIALS"));
      return;
    }
    if (
      user.must_change_password &&
      (!user.temporary_password_expires_at ||
        user.temporary_password_expires_at.getTime() <= Date.now())
    ) {
      res.status(403).json(invalid("Your temporary password has expired.", "PASSWORD_EXPIRED"));
      return;
    }

    if (needsPasswordRehash(user.password_hash)) {
      const upgradedHash = await hashPassword(parsed.data.password);
      await withOrg(org.id, (client) =>
        client.query(
          `UPDATE identity.users
              SET password_hash = $1, updated_at = now()
            WHERE id = $2 AND org_id = $3 AND password_hash = $4`,
          [upgradedHash, user.id, org.id, user.password_hash],
        ),
      );
    }

    const authUser = {
      id: user.id,
      orgId: user.org_id,
      name: user.name,
      email: user.email,
      roles: user.roles,
      mustChangePassword: user.must_change_password,
    };
    if (parsed.data.rememberMe) {
      const credential = createRefreshCredential(org.id);
      const csrfToken = createCsrfToken();
      await withOrg(org.id, (client) =>
        client.query(
          `INSERT INTO identity.auth_sessions
             (id, org_id, user_id, refresh_secret_hash, expires_at)
           VALUES ($1, $2, $3, $4, now() + ($5 * interval '1 second'))`,
          [
            credential.sessionId,
            org.id,
            user.id,
            hashRefreshSecret(credential.secret),
            REMEMBERED_SESSION_SECONDS,
          ],
        ),
      );
      res.header("set-cookie", createSessionCookies(credential, csrfToken));
    } else {
      res.header("set-cookie", clearSessionCookies());
    }
    res.status(200).json({ accessToken: createAccessToken(authUser), user: authUser });
  } catch (error) {
    next(error);
  }
});

router.post("/identity/auth/refresh", async (req, res, next) => {
  if (!hasValidCsrfToken(req)) {
    res.status(403).json(invalid("The session security check failed. Refresh the page and sign in again.", "CSRF_FAILED"));
    return;
  }

  const credential = readRefreshCredential(req.headers.cookie);
  if (!credential) {
    res.header("set-cookie", clearSessionCookies());
    res.status(401).json(invalid("Sign in to continue.", "UNAUTHENTICATED"));
    return;
  }

  try {
    const nextCredential = createRefreshCredential(credential.orgId, credential.sessionId);
    const csrfToken = createCsrfToken();
    const sessionResult = await withOrg(credential.orgId, async (client) => {
      const result = await client.query<{
        refresh_secret_hash: string;
        id: string;
        org_id: string;
        name: string;
        email: string;
        must_change_password: boolean;
        temporary_password_expires_at: Date | null;
        roles: Array<"super_admin" | "org_admin" | "campus_admin" | "hod" | "teacher" | "class_teacher" | "student" | "parent">;
      }>(
        `SELECT s.refresh_secret_hash, u.id, u.org_id, u.name, u.email,
                u.must_change_password, u.temporary_password_expires_at,
                COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
           FROM identity.auth_sessions AS s
           JOIN identity.users AS u
             ON u.id = s.user_id AND u.org_id = s.org_id
           LEFT JOIN identity.user_roles AS ur
             ON ur.user_id = u.id AND ur.org_id = u.org_id
          WHERE s.id = $1 AND s.org_id = $2
            AND s.revoked_at IS NULL AND s.expires_at > now()
            AND u.status = 'active'
          GROUP BY s.id, u.id`,
        [credential.sessionId, credential.orgId],
      );
      const session = result.rows[0];
      if (
        !session ||
        session.roles.length === 0 ||
        !matchesRefreshSecret(credential.secret, session.refresh_secret_hash) ||
        (session.must_change_password &&
          (!session.temporary_password_expires_at ||
            session.temporary_password_expires_at.getTime() <= Date.now()))
      ) {
        return null;
      }

      const updated = await client.query(
        `UPDATE identity.auth_sessions
            SET refresh_secret_hash = $1,
                last_used_at = now(),
                expires_at = now() + ($2 * interval '1 second')
          WHERE id = $3 AND org_id = $4 AND refresh_secret_hash = $5
            AND revoked_at IS NULL AND expires_at > now()`,
        [
          hashRefreshSecret(nextCredential.secret),
          REMEMBERED_SESSION_SECONDS,
          credential.sessionId,
          credential.orgId,
          session.refresh_secret_hash,
        ],
      );
      if (updated.rowCount !== 1) return null;

      return {
        id: session.id,
        orgId: session.org_id,
        name: session.name,
        email: session.email,
        roles: session.roles,
        mustChangePassword: session.must_change_password,
      };
    });

    if (!sessionResult) {
      res.header("set-cookie", clearSessionCookies());
      res.status(401).json(invalid("Your remembered session is no longer valid. Sign in again.", "UNAUTHENTICATED"));
      return;
    }

    res.header("set-cookie", createSessionCookies(nextCredential, csrfToken));
    res.status(200).json({
      accessToken: createAccessToken(sessionResult),
      user: sessionResult,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/identity/auth/logout", async (req, res, next) => {
  const credential = readRefreshCredential(req.headers.cookie);
  if (credential && !hasValidCsrfToken(req)) {
    res.status(403).json(invalid("The session security check failed.", "CSRF_FAILED"));
    return;
  }

  try {
    if (credential) {
      await withOrg(credential.orgId, (client) =>
        client.query(
          `UPDATE identity.auth_sessions
              SET revoked_at = now()
            WHERE id = $1 AND org_id = $2 AND refresh_secret_hash = $3
              AND revoked_at IS NULL`,
          [credential.sessionId, credential.orgId, hashRefreshSecret(credential.secret)],
        ),
      );
    }
    res.header("set-cookie", clearSessionCookies());
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post("/identity/auth/change-password", requireAuth, async (req, res, next) => {
  const user = req.campusUser;
  if (!user) return void res.status(401).json(invalid("Sign in to continue.", "UNAUTHENTICATED"));

  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success || !isValidNewPassword(parsed.data.newPassword)) {
    return void res.status(400).json(invalid("Your new password must contain 12–256 characters."));
  }
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return void res.status(400).json(invalid("Choose a password different from your current password."));
  }

  try {
    const current = await withOrg(user.orgId, (client) =>
      client.query<{ password_hash: string; must_change_password: boolean }>(
        `SELECT password_hash, must_change_password
           FROM identity.users
          WHERE id = $1 AND org_id = $2 AND status = 'active'`,
        [user.id, user.orgId],
      ),
    );
    const row = current.rows[0];
    if (!row || !(await verifyPassword(parsed.data.currentPassword, row.password_hash))) {
      return void res.status(401).json(invalid("Your current password is incorrect.", "INVALID_CREDENTIALS"));
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    const updated = await withOrg(user.orgId, (client) =>
      client.query(
        `UPDATE identity.users
            SET password_hash = $1, must_change_password = false,
                temporary_password_expires_at = NULL, updated_at = now()
          WHERE id = $2 AND org_id = $3 AND password_hash = $4
          RETURNING id`,
        [passwordHash, user.id, user.orgId, row.password_hash],
      ),
    );
    if (!updated.rowCount) {
      return void res.status(409).json(invalid("Your password changed in another request. Sign in again.", "PASSWORD_CHANGED"));
    }

    const updatedUser = { ...user, mustChangePassword: false };
    res.json({ accessToken: createAccessToken(updatedUser), user: updatedUser });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/identity/teachers",
  requireAuth,
  requireRoles("super_admin", "org_admin", "campus_admin"),
  async (req, res, next) => {
    const actor = req.campusUser;
    if (!actor) return void res.status(401).json(invalid("Sign in to continue.", "UNAUTHENTICATED"));

    const parsed = CreateTeacherAccountBody.safeParse(req.body);
    if (!parsed.success) {
      return void res.status(400).json(invalid("Enter a valid teacher name and email address."));
    }
    const name = parsed.data.name.trim();
    const email = parsed.data.email.trim().toLowerCase();
    if (!name || !email) {
      return void res.status(400).json(invalid("Teacher name and email cannot be blank."));
    }

    try {
      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const teacher = await withOrg(actor.orgId, async (client) => {
        const created = await client.query<{ id: string; name: string; email: string }>(
          `INSERT INTO identity.users
             (org_id, email, name, password_hash, status, must_change_password, temporary_password_expires_at)
           VALUES ($1, $2, $3, $4, 'active', true, $5)
           RETURNING id, name, email`,
          [actor.orgId, email, name, passwordHash, expiresAt],
        );
        const account = created.rows[0];
        if (!account) throw new Error("Teacher account was not created.");
        await client.query(
          `INSERT INTO identity.user_roles (org_id, user_id, role)
           VALUES ($1, $2, 'teacher')`,
          [actor.orgId, account.id],
        );
        return account;
      });

      res.status(201).json({
        ...teacher,
        role: "teacher",
        temporaryPassword,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error: any) {
      if (error?.code === "23505") {
        return void res.status(409).json(invalid("An account with this email already exists in your school.", "CONFLICT"));
      }
      next(error);
    }
  },
);

router.post(
  "/identity/admins",
  requireAuth,
  requireRoles("super_admin", "org_admin"),
  async (req, res, next) => {
    const actor = req.campusUser;
    if (!actor) return void res.status(401).json(invalid("Sign in to continue.", "UNAUTHENTICATED"));
    if (!canCreateSchoolAdmin(actor.roles)) {
      return void res.status(403).json(invalid("Only a school or platform administrator can create a school administrator.", "FORBIDDEN"));
    }

    const parsed = CreateSchoolAdminAccountBody.safeParse(req.body);
    if (!parsed.success) {
      return void res.status(400).json(invalid("Enter a valid administrator name and email address."));
    }
    const name = parsed.data.name.trim();
    const email = parsed.data.email.trim().toLowerCase();
    if (!name || !email) {
      return void res.status(400).json(invalid("Administrator name and email cannot be blank."));
    }

    try {
      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const administrator = await withOrg(actor.orgId, async (client) => {
        const created = await client.query<{ id: string; name: string; email: string }>(
          `INSERT INTO identity.users
             (org_id, email, name, password_hash, status, must_change_password, temporary_password_expires_at)
           VALUES ($1, $2, $3, $4, 'active', true, $5)
           RETURNING id, name, email`,
          [actor.orgId, email, name, passwordHash, expiresAt],
        );
        const account = created.rows[0];
        if (!account) throw new Error("School administrator account was not created.");
        await client.query(
          `INSERT INTO identity.user_roles (org_id, user_id, role)
           VALUES ($1, $2, 'org_admin')`,
          [actor.orgId, account.id],
        );
        return account;
      });

      req.log.info(
        { actorUserId: actor.id, organizationId: actor.orgId, createdUserId: administrator.id, createdRole: "org_admin" },
        "School administrator account created",
      );
      res.status(201).json({
        ...administrator,
        role: "org_admin",
        temporaryPassword,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error: any) {
      if (error?.code === "23505") {
        return void res.status(409).json(invalid("An account with this email already exists in your school.", "CONFLICT"));
      }
      next(error);
    }
  },
);

router.get(
  "/identity/admins",
  requireAuth,
  requireRoles("super_admin", "org_admin"),
  async (req, res, next) => {
    const actor = req.campusUser;
    if (!actor) return void res.status(401).json(invalid("Sign in to continue.", "UNAUTHENTICATED"));
    if (!canCreateSchoolAdmin(actor.roles)) {
      return void res.status(403).json(invalid("Only a school or platform administrator can view school administrator accounts.", "FORBIDDEN"));
    }
    const rawQuery = req.query as Record<string, unknown>;
    const rawIncludeDisabled = rawQuery.includeDisabled;
    if (
      rawIncludeDisabled !== undefined &&
      rawIncludeDisabled !== true &&
      rawIncludeDisabled !== false &&
      rawIncludeDisabled !== "true" &&
      rawIncludeDisabled !== "false"
    ) {
      return void res.status(400).json(invalid("includeDisabled must be true or false."));
    }
    const parsed = GetSchoolAdminAccountsQueryParams.safeParse({
      ...rawQuery,
      includeDisabled: rawIncludeDisabled === true || rawIncludeDisabled === "true",
    });
    if (!parsed.success) return void res.status(400).json(invalid("Provide valid account list filters."));

    try {
      const { includeDisabled, limit, offset } = parsed.data;
      const page = await withOrg(actor.orgId, async (client) => {
        const [countResult, accountResult] = await Promise.all([
          client.query<{ total: number }>(
            `SELECT count(*)::int AS total
               FROM identity.users u
               JOIN identity.user_roles role
                 ON role.org_id = u.org_id AND role.user_id = u.id AND role.role = 'org_admin'
              WHERE u.org_id = $1 AND ($2::boolean OR u.status = 'active')`,
            [actor.orgId, includeDisabled],
          ),
          client.query(
            `SELECT u.id, u.name, u.email, u.status, u.created_at AS "createdAt"
               FROM identity.users u
               JOIN identity.user_roles role
                 ON role.org_id = u.org_id AND role.user_id = u.id AND role.role = 'org_admin'
              WHERE u.org_id = $1 AND ($2::boolean OR u.status = 'active')
              ORDER BY lower(u.name), lower(u.email), u.id
              LIMIT $3 OFFSET $4`,
            [actor.orgId, includeDisabled, limit, offset],
          ),
        ]);
        return {
          items: accountResult.rows,
          total: countResult.rows[0]?.total ?? 0,
          limit,
          offset,
        };
      });
      res.json(page);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/identity/admins/:userId",
  requireAuth,
  requireRoles("super_admin", "org_admin"),
  async (req, res, next) => {
    const actor = req.campusUser;
    if (!actor) return void res.status(401).json(invalid("Sign in to continue.", "UNAUTHENTICATED"));
    if (!canCreateSchoolAdmin(actor.roles)) {
      return void res.status(403).json(invalid("Only a school or platform administrator can manage school administrator accounts.", "FORBIDDEN"));
    }

    const params = UpdateSchoolAdminAccountParams.safeParse(req.params);
    const body = UpdateSchoolAdminAccountBody.safeParse(req.body);
    if (!params.success || !body.success) {
      return void res.status(400).json(invalid("Provide a valid administrator ID and account status."));
    }
    if (params.data.userId === actor.id && body.data.status === "disabled") {
      return void res.status(409).json(invalid("You cannot deactivate your own administrator account.", "SELF_DEACTIVATION"));
    }

    try {
      const result = await withOrg(actor.orgId, async (client) => {
        // Lock this school's admin rows in a stable order so concurrent deactivations
        // cannot both pass the final-active-admin check.
        const lockedAdmins = await client.query<{ id: string }>(
          `SELECT u.id
             FROM identity.users u
             JOIN identity.user_roles role
               ON role.org_id = u.org_id AND role.user_id = u.id AND role.role = 'org_admin'
            WHERE u.org_id = $1
            ORDER BY u.id
            FOR UPDATE OF u`,
          [actor.orgId],
        );
        if (!lockedAdmins.rows.some((account) => account.id === params.data.userId)) {
          return { kind: "not_found" as const };
        }

        const currentResult = await client.query<{
          id: string; name: string; email: string; status: "active" | "disabled"; createdAt: Date;
        }>(
          `SELECT u.id, u.name, u.email, u.status, u.created_at AS "createdAt"
             FROM identity.users u
             JOIN identity.user_roles role
               ON role.org_id = u.org_id AND role.user_id = u.id AND role.role = 'org_admin'
            WHERE u.org_id = $1 AND u.id = $2`,
          [actor.orgId, params.data.userId],
        );
        const current = currentResult.rows[0];
        if (!current) return { kind: "not_found" as const };
        if (current.status === body.data.status) return { kind: "updated" as const, account: current };

        if (body.data.status === "disabled") {
          const activeCount = await client.query<{ total: number }>(
            `SELECT count(*)::int AS total
               FROM identity.users u
               JOIN identity.user_roles role
                 ON role.org_id = u.org_id AND role.user_id = u.id AND role.role = 'org_admin'
              WHERE u.org_id = $1 AND u.status = 'active'`,
            [actor.orgId],
          );
          if (!canDeactivateSchoolAdmin(actor.id, params.data.userId, activeCount.rows[0]?.total ?? 0)) {
            return { kind: "last_active_admin" as const };
          }
        }

        const updated = await client.query<{
          id: string; name: string; email: string; status: "active" | "disabled"; createdAt: Date;
        }>(
          `UPDATE identity.users
              SET status = $3, updated_at = now()
            WHERE org_id = $1 AND id = $2
            RETURNING id, name, email, status, created_at AS "createdAt"`,
          [actor.orgId, params.data.userId, body.data.status],
        );
        const account = updated.rows[0];
        if (!account) return { kind: "not_found" as const };

        if (body.data.status === "disabled") {
          await client.query(
            `UPDATE identity.auth_sessions
                SET revoked_at = now()
              WHERE org_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
            [actor.orgId, params.data.userId],
          );
        }
        return { kind: "updated" as const, account };
      });

      if (result.kind === "not_found") {
        return void res.status(404).json(invalid("School administrator not found.", "NOT_FOUND"));
      }
      if (result.kind === "last_active_admin") {
        return void res.status(409).json(invalid("The school must keep at least one active administrator.", "LAST_ACTIVE_ADMIN"));
      }
      req.log.info(
        { actorUserId: actor.id, organizationId: actor.orgId, targetUserId: result.account.id, status: result.account.status },
        "School administrator account status updated",
      );
      res.json(result.account);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/identity/users/:userId/reset-password",
  requireAuth,
  requireRoles("super_admin", "org_admin", "campus_admin"),
  async (req, res, next) => {
    const actor = req.campusUser;
    if (!actor) return void res.status(401).json(invalid("Sign in to continue.", "UNAUTHENTICATED"));
    const params = ResetPasswordParams.safeParse(req.params);
    if (!params.success) return void res.status(400).json(invalid("A valid user ID is required."));

    try {
      const targetResult = await withOrg(actor.orgId, (client) =>
        client.query<{ id: string; status: string; roles: import("../lib/auth").CampusRole[] }>(
          `SELECT u.id, u.status,
                  COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
             FROM identity.users u
             LEFT JOIN identity.user_roles ur
               ON ur.user_id = u.id AND ur.org_id = u.org_id
            WHERE u.id = $1 AND u.org_id = $2
            GROUP BY u.id`,
          [params.data.userId, actor.orgId],
        ),
      );
      const target = targetResult.rows[0];
      if (!target) return void res.status(404).json(invalid("User not found.", "NOT_FOUND"));
      if (target.status !== "active") return void res.status(409).json(invalid("Disabled accounts cannot be reset.", "USER_DISABLED"));
      if (!canManageUser(actor.roles, target.roles)) {
        return void res.status(403).json(invalid("You cannot reset a user with an equal or higher administrative role.", "FORBIDDEN"));
      }

      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await withOrg(actor.orgId, async (client) => {
        await client.query(
          `UPDATE identity.users
              SET password_hash = $1, must_change_password = true,
                  temporary_password_expires_at = $2, updated_at = now()
            WHERE id = $3 AND org_id = $4`,
          [passwordHash, expiresAt, target.id, actor.orgId],
        );
        await client.query(
          `UPDATE identity.auth_sessions
              SET revoked_at = now()
            WHERE user_id = $1 AND org_id = $2 AND revoked_at IS NULL`,
          [target.id, actor.orgId],
        );
      });
      res.json({ temporaryPassword, expiresAt: expiresAt.toISOString() });
    } catch (error) {
      next(error);
    }
  },
);

router.get("/identity/me", requireAuth, (req, res, _next) => {
  const user = req.campusUser;
  if (!user) {
    res.status(401).json(invalid("Sign in to continue.", "UNAUTHENTICATED"));
    return;
  }
  res.json({
    id: user.id,
    orgId: user.orgId,
    name: user.name,
    email: user.email,
    roles: user.roles,
    mustChangePassword: user.mustChangePassword,
  });
});
};

export default routes;
