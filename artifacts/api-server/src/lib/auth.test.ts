import assert from "node:assert/strict";
import { generateKeyPairSync, createSign, webcrypto, type KeyObject } from "node:crypto";
import { test } from "node:test";
import { setJwksFetcher, verifySupabaseToken } from "./auth.ts";
import { hashPassword, verifyPassword } from "./password-hash.ts";

const ISSUER = "https://campus.example.supabase.co/auth/v1/";

function base64Url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

interface RsaKeyPair {
  publicKeyJwk: webcrypto.JsonWebKey & { kid: string };
  privateKey: KeyObject;
}

function makeRsaKeyPair(kid: string): RsaKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" }) as webcrypto.JsonWebKey;
  return { publicKeyJwk: { ...jwk, kid }, privateKey };
}

function makeEcKeyPair(kid: string): RsaKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" }) as webcrypto.JsonWebKey;
  return { publicKeyJwk: { ...jwk, kid }, privateKey };
}

function signToken(
  pair: RsaKeyPair,
  payload: Record<string, unknown>,
  alg: "RS256" | "ES256" = "RS256",
): string {
  const header = base64Url(JSON.stringify({ alg, typ: "JWT", kid: pair.publicKeyJwk.kid }));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signer = alg === "ES256" ? createSign("SHA256") : createSign("RSA-SHA256");
  signer.update(`${header}.${encodedPayload}`);
  const signature = (alg === "ES256"
    ? signer.sign({ key: pair.privateKey, dsaEncoding: "ieee-p1363" })
    : signer.sign(pair.privateKey)
  ).toString("base64url");
  return `${header}.${encodedPayload}.${signature}`;
}

const sub = "11111111-2222-3333-4444-555555555555";

test("accepts a valid Supabase access token signed by the project JWKS", async () => {
  const pair = makeRsaKeyPair("test-key-1");
  setJwksFetcher(async () => ({ keys: [pair.publicKeyJwk] }));
  try {
    const token = signToken(pair, {
      iss: ISSUER,
      aud: "authenticated",
      sub,
      email: "teacher@demo.edu",
      exp: 1_800_000_100,
      iat: 1_800_000_000,
    });
    const claims = await verifySupabaseToken(token, 1_800_000_050);
    assert.equal(claims?.sub, sub);
    assert.equal(claims?.email, "teacher@demo.edu");
  } finally {
    setJwksFetcher(null);
  }
});

test("accepts an ES256 token, the current Supabase signing algorithm", async () => {
  const pair = makeEcKeyPair("ec-key-1");
  setJwksFetcher(async () => ({ keys: [pair.publicKeyJwk] }));
  try {
    const token = signToken(pair, {
      iss: ISSUER,
      aud: "authenticated",
      sub,
      email: "student@demo.edu",
      exp: 1_800_000_100,
    }, "ES256");
    const claims = await verifySupabaseToken(token, 1_800_000_050);
    assert.equal(claims?.sub, sub);
  } finally {
    setJwksFetcher(null);
  }
});

test("rejects a token signed by a key not in the JWKS", async () => {
  const trusted = makeRsaKeyPair("trusted-key");
  const attacker = makeRsaKeyPair("attacker-key");
  setJwksFetcher(async () => ({ keys: [trusted.publicKeyJwk] }));
  try {
    const token = signToken(attacker, {
      iss: ISSUER,
      aud: "authenticated",
      sub,
      exp: 1_800_000_100,
    });
    assert.equal(await verifySupabaseToken(token, 1_800_000_050), null);
  } finally {
    setJwksFetcher(null);
  }
});

test("rejects a token whose payload was changed", async () => {
  const pair = makeRsaKeyPair("test-key-2");
  setJwksFetcher(async () => ({ keys: [pair.publicKeyJwk] }));
  try {
    const token = signToken(pair, { iss: ISSUER, aud: "authenticated", sub, exp: 1_800_000_100 });
    const [header, , signature] = token.split(".");
    const changedPayload = base64Url(JSON.stringify({ iss: ISSUER, aud: "authenticated", sub, role: "service_role", exp: 1_900_000_000 }));
    assert.equal(await verifySupabaseToken(`${header}.${changedPayload}.${signature}`, 1_800_000_050), null);
  } finally {
    setJwksFetcher(null);
  }
});

test("rejects expired tokens and non-authenticated audiences", async () => {
  const pair = makeRsaKeyPair("test-key-3");
  setJwksFetcher(async () => ({ keys: [pair.publicKeyJwk] }));
  try {
    const expired = signToken(pair, { iss: ISSUER, aud: "authenticated", sub, exp: 1_800_000_000 });
    assert.equal(await verifySupabaseToken(expired, 1_800_000_050), null);

    const anonToken = signToken(pair, { iss: ISSUER, aud: "anon", sub, exp: 1_800_000_100 });
    assert.equal(await verifySupabaseToken(anonToken, 1_800_000_050), null);
  } finally {
    setJwksFetcher(null);
  }
});

test("hashes passwords and rejects a different password", async () => {
  const encoded = await hashPassword("Passw0rd!");
  assert.match(encoded, /^\$scrypt\$131072\$/);
  assert.equal(await verifyPassword("Passw0rd!", encoded), true);
  assert.equal(await verifyPassword("not-the-password", encoded), false);
});

test("rejects password hashes with unsafe work factors", async () => {
  assert.equal(
    await verifyPassword("Passw0rd!", "$scrypt$1048576$8$1$c2FsdA$a2V5"),
    false,
  );
});
