# Phase 0: Payload-First Security TDD Specification

## 1. Data Invariants
- **Authentication requirement**: No anonymous or unauthenticated users can write projects.
- **Identity Integrity**: The user writing a project MUST set `ownerId` to their exact authenticated Firebase UID (`request.auth.uid`).
- **Strict Keys constraint**: Every document in `/projects/{projectId}` must conform to the strict JSON layout structure (no shadow or phantom fields).
- **Temporal Integrity**: `createdAt` on initialize must match the exact server timestamp `request.time`. `updatedAt` on update or initial create must match `request.time`.
- **Signoff verification**: Multi-user operations must prevent users from overwriting or deleting another user's project records, unless the project is public (for viewing) or they are the explicitly registered owner.

---

## 2. The "Dirty Dozen" Malicious/Invalid Payloads

1. **The Spoofed Identifier Attack**: An editor attempts to create a project with another designer's user ID.
2. **The Temporal Fraud Attack**: Client specifies a back-dated or future timestamp in `createdAt` to bypass regression sorting.
3. **The Shadow Field Escalation**: Client appends an unauthorized `"isAdmin"` boolean or `"systemGenerated"` status key to elevate root privileges.
4. **The Ghost Key Attack (Truncation)**: Client writes a skeleton payload containing only `name` and missing the critical `graph` key.
5. **The Billion Connects Denial-of-Wallet**: Writing an infinitely bloated 5MB JSON payload as a document ID to crash parsing limits.
6. **The Unverified Email Read Intrusion**: Attempting to query another's project by asserting they are signed in, but their email lacks verification.
7. **The Terminal State Lock-Bypass**: Attempting to alter a terminal or immutable field after project sign-off.
8. **The Orphaned Record Injection**: Creating a mock project metadata document referencing a non-existent parent catalog ID.
9. **The Blank ID Character Poisoning**: Writing random Unicode or trailing whitespace char strings into `{projectId}` document keys.
10. **The Anonymous Write Attempt**: An unauthenticated consumer attempts to populate a demo board into the database.
11. **The State Step Shortcut**: Skipping standard checkpoints to abruptly promote draft board revisions to production-ready copper state.
12. **The Vector Clock Drift Vulnerability**: Tampering with collaboration delta payloads to forcefully override consensus clocks.

---

## 3. The Firebase Security Rules Test Harness

The rules will be verified directly against the "Dirty Dozen" to produce a strict environment. A test specification (`firestore.rules.test.ts`) is designed conceptually to block all malicious operations:

```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

// Verification assertions to ensure permission is always denied for Dirty Dozen payloads.
```
