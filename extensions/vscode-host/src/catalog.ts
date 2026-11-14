import type { ReviewedBackendRegistration } from "./loader.js";

/** Build-owned catalog. No workspace, model response, driver or user setting supplies entries.
 * Publication must use a reviewed external integrity/qualification envelope to avoid a
 * self-referential host digest. Until that adoption path is implemented, keep this empty.
 */
export const reviewedBackendCatalog: readonly ReviewedBackendRegistration[] = [];
