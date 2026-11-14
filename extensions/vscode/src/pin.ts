import { createHash } from "node:crypto";
/** Reviewed M21 native artifact retained for the Cline-only release. A revision label is not sufficient. */
export const REVIEWED_CLINE_PIN = Object.freeze({ version: "4.1.2203", baseVersion: "4.1.22", revision: 3,
    extensionSha256: "8da2f0506aacc06906d81783cd9ad540b93f68fdc64606d2c5e77b15d2ef1f29",
    nativeSha256: "0ebcea87dd7f119f6cef806a964d1d63942581565275caeeaa36f397ad69b938" });
/** Exact M30 disposable candidate. Native acceptance is still required before release adoption. */
export const M30_CANDIDATE_CLINE_PIN = Object.freeze({ version: "4.1.2204", baseVersion: "4.1.22", revision: 4,
    extensionSha256: "8da2f0506aacc06906d81783cd9ad540b93f68fdc64606d2c5e77b15d2ef1f29",
    nativeSha256: "81bc1d836ba694910ea895fa63902d9b9272bca6ef547591e56d8c910bf4da72" });
/** MI-04 isolated candidate; acceptance remains separate from source fingerprint review. */
export const MI04_CANDIDATE_CLINE_PIN = Object.freeze({ version: "4.1.2206", baseVersion: "4.1.22", revision: 6,
    extensionSha256: "8da2f0506aacc06906d81783cd9ad540b93f68fdc64606d2c5e77b15d2ef1f29",
    nativeSha256: "323df8a1bf2f226e0f5d30a706e3c794633f4d49ec87a417a7e11598f17731a9" });
type ClineManifest = { version?: string; sdcPatch?: { baseVersion?: string; revision?: number } };
const reviewedPins = [REVIEWED_CLINE_PIN, M30_CANDIDATE_CLINE_PIN, MI04_CANDIDATE_CLINE_PIN];
/** Activation and fingerprint verification use one registry; metadata alone never grants controls. */
export function isReviewedClineManifest(manifest: ClineManifest): boolean {
    return reviewedPins.some(pin => manifest.version === pin.version && manifest.sdcPatch?.baseVersion === pin.baseVersion && manifest.sdcPatch?.revision === pin.revision);
}
export function assertReviewedClinePin(manifest: ClineManifest, extension: Uint8Array, native: Uint8Array): void {
    const hash = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
    const exact = reviewedPins.some(pin => manifest.version === pin.version && manifest.sdcPatch?.baseVersion === pin.baseVersion && manifest.sdcPatch?.revision === pin.revision && hash(extension) === pin.extensionSha256 && hash(native) === pin.nativeSha256);
    if (!exact)
        throw new Error("Cline build changed or is unsupported. Remote controls require the reviewed native fingerprint; review and native acceptance are required before adopting an update.");
}
