import { beforeEach, expect, it, vi } from "vitest";
import * as Crypto from "expo-crypto";
import * as AppleAuthentication from "expo-apple-authentication";
import { requestAppleIdentity } from "./apple-authentication";

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace the native Apple SDK boundary; the credential adapter remains real.
vi.mock("expo-apple-authentication", () => ({
  signInAsync: vi.fn<typeof AppleAuthentication.signInAsync>(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace native randomness and hashing with a known nonce pair.
vi.mock("expo-crypto", () => ({
  randomUUID: () => "native-request",
  digestStringAsync: vi.fn<typeof Crypto.digestStringAsync>(
    async () =>
      "3a461e0943140fad72dae7438017ced94863859971a272ea51e87fa0ae2914b8",
  ),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
}));

beforeEach(() => vi.clearAllMocks());

it("sends a hashed nonce to Apple and retains the raw nonce and first-use name for verification", async () => {
  vi.mocked(AppleAuthentication.signInAsync).mockResolvedValue({
    identityToken: "signed-identity-token",
    authorizationCode: "authorization-code",
    user: "apple-member",
    email: "member@privaterelay.appleid.com",
    fullName: {
      givenName: "Ada",
      familyName: "Lovelace",
      namePrefix: null,
      middleName: null,
      nameSuffix: null,
      nickname: null,
    },
    state: null,
    realUserStatus: 1,
  });

  const identity = await requestAppleIdentity();

  expect(Crypto.digestStringAsync).toHaveBeenCalledWith(
    Crypto.CryptoDigestAlgorithm.SHA256,
    "native-request",
  );
  expect(AppleAuthentication.signInAsync).toHaveBeenCalledWith({
    nonce: "3a461e0943140fad72dae7438017ced94863859971a272ea51e87fa0ae2914b8",
    requestedScopes: [0, 1],
  });
  expect(identity).toEqual({
    token: "signed-identity-token",
    nonce: "native-request",
    user: { name: { firstName: "Ada", lastName: "Lovelace" } },
  });
});

it("accepts repeat authorization without a name or native email field", async () => {
  vi.mocked(AppleAuthentication.signInAsync).mockResolvedValue({
    identityToken: "signed-identity-token",
    authorizationCode: "authorization-code",
    user: "apple-member",
    email: null,
    fullName: null,
    state: null,
    realUserStatus: 1,
  });

  expect(await requestAppleIdentity()).toEqual({
    token: "signed-identity-token",
    nonce: "native-request",
    user: undefined,
  });
});

it("returns no identity when the user cancels", async () => {
  vi.mocked(AppleAuthentication.signInAsync).mockRejectedValue({
    code: "ERR_REQUEST_CANCELED",
  });

  expect(await requestAppleIdentity()).toBeNull();
});

it("rejects a credential without an identity token", async () => {
  vi.mocked(AppleAuthentication.signInAsync).mockResolvedValue({
    identityToken: null,
    authorizationCode: "authorization-code",
    user: "apple-member",
    email: null,
    fullName: null,
    state: null,
    realUserStatus: 1,
  });

  await expect(requestAppleIdentity()).rejects.toThrow(
    "Kunne ikke logge inn med Apple.",
  );
});

it("reports native failures without treating them as cancellation", async () => {
  vi.mocked(AppleAuthentication.signInAsync).mockRejectedValue({
    code: "ERR_REQUEST_FAILED",
  });

  await expect(requestAppleIdentity()).rejects.toThrow(
    "Kunne ikke logge inn med Apple.",
  );
});
