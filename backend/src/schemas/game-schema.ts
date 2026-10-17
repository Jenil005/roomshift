import type { CollectionSchema } from 'deepspace/schema'

/**
 * Public, read-only mirror of each game room (recordId = room code).
 *
 * Written only by GameRoom through RBAC-bypassing tools; every client, including
 * anonymous judges' phones, reads it live with `useQuery('rs_rooms', { where: { code } })`.
 * Holds no secrets: private clues and token hashes stay inside the GameRoom DO.
 */
export const roomsSchema: CollectionSchema = {
  name: 'rs_rooms',
  columns: [
    { name: 'code', storage: 'text', interpretation: 'plain' },
    { name: 'phase', storage: 'text', interpretation: 'plain' },
    { name: 'version', storage: 'number', interpretation: 'plain' },
    { name: 'view', storage: 'text', interpretation: { kind: 'json' } },
  ],
  permissions: {
    '*': { read: true, create: false, update: false, delete: false },
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: false, update: false, delete: false },
  },
}
