/** Non-authoritative labels a client may attach to a binding so people can tell concurrent windows apart. */
export const BINDING_DISPLAY_LABELS = ["conversationLabel", "workspaceLabel", "windowLabel"] as const;
export type BindingDisplayLabel = typeof BINDING_DISPLAY_LABELS[number];
export type BindingDisplay = Partial<Record<BindingDisplayLabel, string>>;
export const MAX_DISPLAY_LABEL_LENGTH = 120;
/** Control, zero-width and bidirectional formatting characters could disguise one binding as another. */
export const UNSAFE_DISPLAY_LABEL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/;
const UNSAFE_GLOBAL = new RegExp(UNSAFE_DISPLAY_LABEL_CHARACTERS.source, "g");

/** Converts arbitrary text into an acceptable label, or `undefined` when nothing printable remains. */
export function normalizeDisplayLabel(value: string): string | undefined {
    const text = value.replace(UNSAFE_GLOBAL, " ").replace(/\s+/g, " ").trim();
    let label = "";
    // Truncate on code points so a surrogate pair is never split.
    for (const character of text) {
        if (label.length + character.length > MAX_DISPLAY_LABEL_LENGTH) break;
        label += character;
    }
    return label.trim() || undefined;
}
