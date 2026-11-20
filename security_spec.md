# KathaVani Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **PII Isolation**: `/users/{userId}` contains `email` and is strictly readable/writable only by `request.auth.uid == userId` with a verified email. No list operations are allowed on `/users`.
2. **Project Ownership**: Every `/projects/{projectId}` document belongs to a single verified creator (`ownerId == request.auth.uid`). `ownerId`, `id`, and `createdAt` are immutable after creation.
3. **Master Gate Relational Sync**: A scene in `/projects/{projectId}/scenes/{sceneId}` cannot be created, read (`get`), updated, or deleted unless the parent `/projects/{projectId}` exists and is owned by `request.auth.uid`.
4. **Secure List Enforcement**: `allow list` on `/projects` and `/projects/{projectId}/scenes` explicitly checks `resource.data.ownerId == request.auth.uid` without `get()` lookups.
5. **Terminal State Locking**: Once a project reaches `status == 'archived'`, no further updates are permitted.
6. **Temporal Integrity**: `createdAt` on create and `updatedAt` on create/update must strictly equal `request.time`.
7. **Volumetric & Array Guarding**: All IDs match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars), all strings enforce explicit `.size()` bounds, and `captionLines` is bounded to `<= 20` items with element type validation.

## 2. The Dirty Dozen Adversarial Payloads

1. **PII Read Leak**: User B attempts `get('/users/userA')`. Expected: `PERMISSION_DENIED`.
2. **Unverified Email Write**: Authenticated user with `email_verified: false` creates `/projects/proj_1`. Expected: `PERMISSION_DENIED`.
3. **Identity Spoofing on Create**: User A creates `/projects/proj_spoof` with `ownerId: "userB"`. Expected: `PERMISSION_DENIED`.
4. **Shadow Ghost Field Injection**: User A creates `/projects/proj_ghost` with valid fields plus `isAdmin: true`. Expected: `PERMISSION_DENIED`.
5. **ID Poisoning**: User A creates `/projects/bad..id$$$poison` or a 200-char ID. Expected: `PERMISSION_DENIED`.
6. **Orphan Scene Creation**: User A creates `/projects/nonexistent_proj/scenes/scene_1`. Expected: `PERMISSION_DENIED`.
7. **Cross-Owner Scene Hijack**: User B creates `/projects/userA_proj/scenes/scene_hijack` with `ownerId: "userB"`. Expected: `PERMISSION_DENIED`.
8. **Immutable Field Mutation**: User A updates `/projects/proj_1` attempting to alter `ownerId` or `createdAt`. Expected: `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: User A creates `/projects/proj_time` with client-supplied `createdAt` not matching `request.time`. Expected: `PERMISSION_DENIED`.
10. **Terminal State Bypass**: User A attempts to update `title` on an already `'archived'` project. Expected: `PERMISSION_DENIED`.
11. **Array Poisoning on Captions**: User A creates a scene with `captionLines` containing 25 entries or a non-string first element (`[12345]`). Expected: `PERMISSION_DENIED`.
12. **Blanket Query Scraping**: User B runs `list('/projects')` without filtering to `ownerId == 'userB'` (or targeting User A's documents). Expected: `PERMISSION_DENIED`.
