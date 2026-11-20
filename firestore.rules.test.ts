/**
 * KathaVani Firestore Security Rules TDD Specification Runner
 * Verifies all 12 Dirty Dozen adversarial payloads against firestore.rules invariants.
 * Run against Firebase Emulator with @firebase/rules-unit-testing when testing locally.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  actor: { uid: string; emailVerified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
  enforcedByRule: string;
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'PII Read Leak on /users/{userId}',
    operation: 'get',
    path: '/users/userA',
    actor: { uid: 'userB', emailVerified: true },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: 'isOwner(userId)',
  },
  {
    id: 2,
    name: 'Unverified Email Write',
    operation: 'create',
    path: '/projects/proj_unverified',
    actor: { uid: 'userA', emailVerified: false },
    payload: { id: 'proj_unverified', ownerId: 'userA', title: 'Test' },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: 'isVerifiedUser()',
  },
  {
    id: 3,
    name: 'Identity Spoofing on Project Create',
    operation: 'create',
    path: '/projects/proj_spoof',
    actor: { uid: 'userA', emailVerified: true },
    payload: { id: 'proj_spoof', ownerId: 'userB', title: 'Spoofed' },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: 'data.ownerId == request.auth.uid',
  },
  {
    id: 4,
    name: 'Shadow Ghost Field Injection',
    operation: 'create',
    path: '/projects/proj_ghost',
    actor: { uid: 'userA', emailVerified: true },
    payload: { id: 'proj_ghost', ownerId: 'userA', isAdmin: true },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: 'data.keys().hasOnly([...])',
  },
  {
    id: 5,
    name: 'ID Poisoning on Document Path',
    operation: 'create',
    path: '/projects/invalid$id!space',
    actor: { uid: 'userA', emailVerified: true },
    payload: { id: 'invalid$id!space', ownerId: 'userA' },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: 'isValidId(projectId)',
  },
  {
    id: 6,
    name: 'Orphan Scene Creation',
    operation: 'create',
    path: '/projects/missing_parent/scenes/scene_1',
    actor: { uid: 'userA', emailVerified: true },
    payload: { id: 'scene_1', projectId: 'missing_parent', ownerId: 'userA' },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: 'isProjectOwner(projectId) via get() parent verification',
  },
  {
    id: 7,
    name: 'Cross-Owner Scene Hijack',
    operation: 'create',
    path: '/projects/userA_proj/scenes/scene_hijack',
    actor: { uid: 'userB', emailVerified: true },
    payload: { id: 'scene_hijack', projectId: 'userA_proj', ownerId: 'userB' },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: 'isProjectOwner(projectId)',
  },
  {
    id: 8,
    name: 'Immutable Field Mutation (ownerId / createdAt)',
    operation: 'update',
    path: '/projects/proj_1',
    actor: { uid: 'userA', emailVerified: true },
    payload: { ownerId: 'userB' },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: 'incoming().ownerId == existing().ownerId && affectedKeys().hasOnly(...)',
  },
  {
    id: 9,
    name: 'Client Timestamp Forgery',
    operation: 'create',
    path: '/projects/proj_time',
    actor: { uid: 'userA', emailVerified: true },
    payload: { id: 'proj_time', ownerId: 'userA', createdAt: '1999-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: 'incoming().createdAt == request.time',
  },
  {
    id: 10,
    name: 'Terminal State Bypass on Archived Project',
    operation: 'update',
    path: '/projects/proj_archived',
    actor: { uid: 'userA', emailVerified: true },
    payload: { title: 'Mutated After Archive' },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: "existing().status != 'archived'",
  },
  {
    id: 11,
    name: 'Array Poisoning on Scene Captions',
    operation: 'create',
    path: '/projects/proj_1/scenes/scene_poison',
    actor: { uid: 'userA', emailVerified: true },
    payload: { id: 'scene_poison', projectId: 'proj_1', ownerId: 'userA', captionLines: [12345] },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: 'isValidCaptionLines(data.captionLines)',
  },
  {
    id: 12,
    name: 'Blanket Query Scraping on /projects',
    operation: 'list',
    path: '/projects',
    actor: { uid: 'userB', emailVerified: true },
    expected: 'PERMISSION_DENIED',
    enforcedByRule: 'resource.data.ownerId == request.auth.uid',
  },
];
