/** Tokens are not stored in browser storage. Native Keychain code is separate and untested on a device. */

export function createWebSecureStore() {
  return {
    platform: "web",
    available: false,
    encryptionAtRest: false,
    async saveToken() {
      return { ok: false, reason: "secure-storage-unavailable" };
    },
    async loadToken() {
      return { ok: false, reason: "secure-storage-unavailable", token: null };
    }
  };
}
