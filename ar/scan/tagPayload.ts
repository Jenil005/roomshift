import { MARKER_IDS, TAG_PREFIX, type MarkerId } from "../types";

/** The exact text printed in an object's QR tag. */
export function encodeTagPayload(id: MarkerId): string {
  return `${TAG_PREFIX}${id}`;
}

/** Returns the object id for a valid RoomShift tag, or null for anything else. */
export function parseTagPayload(data: unknown): MarkerId | null {
  if (typeof data !== "string" || !data.startsWith(TAG_PREFIX)) return null;
  const id = data.slice(TAG_PREFIX.length);
  return (MARKER_IDS as readonly string[]).includes(id)
    ? (id as MarkerId)
    : null;
}
