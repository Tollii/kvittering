import * as AppleAuthentication from "expo-apple-authentication";
import {
  digestStringAsync,
  CryptoDigestAlgorithm,
  randomUUID,
} from "expo-crypto";
import { z } from "zod";

const nativeError = z.object({ code: z.string() });

/** Obtain native credentials; Better Auth verifies the token on the server. */
export async function requestAppleIdentity() {
  const nonce = randomUUID();

  const hashedNonce = await digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    nonce,
  );

  try {
    const credential = await AppleAuthentication.signInAsync({
      nonce: hashedNonce,
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken)
      throw new Error("Apple returnerte ikke et identitetsbevis. Prøv igjen.");

    return {
      token: credential.identityToken,
      nonce,
      // Apple supplies the name only on the first authorization.
      user: credential.fullName
        ? {
            name: {
              firstName: credential.fullName.givenName ?? undefined,
              lastName: credential.fullName.familyName ?? undefined,
            },
          }
        : undefined,
    };
  } catch (error) {
    const parsed = nativeError.safeParse(error);

    if (parsed.success && parsed.data.code === "ERR_REQUEST_CANCELED")
      return null;

    throw new Error("Kunne ikke logge inn med Apple. Prøv igjen.", {
      cause: error,
    });
  }
}

/** Rejections the person can act on; any other code is a failure worth reporting. */
export function isAppleRejection(code?: string) {
  return code === "OAUTH_LINK_ERROR" || code === "LINKING_FAILED";
}

export function appleAuthenticationError(code?: string) {
  if (code === "OAUTH_LINK_ERROR")
    return "Har du allerede en konto? Logg inn med e-post og koble til Apple i innstillingene.";

  if (code === "LINKING_FAILED")
    return "Kunne ikke koble til Apple. Apple-kontoen kan være knyttet til en annen Kvitto-konto.";

  return "Kunne ikke fullføre med Apple. Prøv igjen.";
}
