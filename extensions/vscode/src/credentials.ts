import { apiJson, profileStorageKey } from "./connect.js";
import type { PairedDevice, ServerProfile } from "./connect.js";

export interface UserTokens { accessToken: string; refreshToken?: string; expiresAt: string; userId: string }
export interface ProfileSecrets {
    get(key: string): PromiseLike<string | undefined>;
    store(key: string, value: string): PromiseLike<void>;
    delete(key: string): PromiseLike<void>;
}
/** Revoke server authority before deleting only this profile's local credentials and inbox. */
export async function forgetProfileCredentials(profile: ServerProfile, secrets: ProfileSecrets,
    removeInbox: (device: PairedDevice) => Promise<void>, request: typeof apiJson = apiJson,
    reauthenticate?: () => Promise<UserTokens>): Promise<void> {
    const prefix = profileStorageKey(profile);
    const storedDevice = await secrets.get(prefix + ".device");
    if (storedDevice) {
        const device = JSON.parse(storedDevice) as PairedDevice;
        const storedUser = await secrets.get(prefix + ".user");
        let user: UserTokens;
        try {
            if (!storedUser) throw new Error("Sign in again before revoking this paired device. Saved credentials have been retained.");
            user = JSON.parse(storedUser) as UserTokens;
            if (Date.parse(user.expiresAt) <= Date.now() + 30000) {
                if (!user.refreshToken) throw new Error("Sign in again before revoking this paired device. Saved credentials have been retained.");
                const refreshed = await request<UserTokens>(profile, "/v2/auth/oidc/refresh", { userId: user.userId, refreshToken: user.refreshToken });
                refreshed.refreshToken ??= user.refreshToken;
                await secrets.store(prefix + ".user", JSON.stringify(refreshed)); user = refreshed;
            }
        } catch (error) {
            if (!reauthenticate) throw error;
            user = await reauthenticate();
            await secrets.store(prefix + ".user", JSON.stringify(user));
        }
        await request(profile, `/api/v1/devices/${encodeURIComponent(device.deviceId)}/revoke`, {}, user.accessToken);
        await removeInbox(device);
        await secrets.delete(prefix + ".device");
    }
    await secrets.delete(prefix + ".user");
}
