# Moto Mando — Firestore Security Specification

## 1. Data Invariants
1. **PII Isolation**: User email, phone number, and personal notification preferences live strictly in `users/{userId}` and are readable/writable only by the owner (`request.auth.uid == userId`) or a verified Admin. Operational fleet cards in `riders/{riderId}` contain zero PII.
2. **No Self-Assigned Admin Escalation**: A user creating their `riders/{riderId}` profile may only set `role == 'rider'` unless `isAdmin()` is true. Non-admins cannot mutate `role`, `uid`, or `createdAt`.
3. **Delivery Relational & Terminal Integrity**:
   - Every delivery has an immutable `createdByUid` matching `request.auth.uid` on creation.
   - Once a delivery reaches `'delivered'` or `'cancelled'`, non-admins cannot modify it.
   - Riders can only claim `'pending'` deliveries or update status/order/timestamps on deliveries assigned to their own `request.auth.uid`.
4. **Immutable Financial Ledger**: Transactions in `transactions/{transactionId}` require an existing `deliveries/{deliveryId}` parent document (`exists(...)`), enforce `riderUid == request.auth.uid` for non-admins, and cannot be edited or deleted by non-admins.
5. **Temporal Integrity**: All `createdAt` and `updatedAt` timestamps must match `request.time`.

## 2. Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated read on `/riders/r1`**: `auth = null` -> DENIED.
2. **Email Spoofing**: `auth = { uid: 'u1', token: { email: 'normanescobar804@gmail.com', email_verified: false } }` reading `/users/other` -> DENIED.
3. **Self-Assigned Admin Role on `/riders/u1` create**: `{ uid: 'u1', role: 'admin', ... }` -> DENIED.
4. **Privilege Escalation Update on `/riders/u1`**: modifying `role: 'admin'` via `update` -> DENIED.
5. **Cross-User PII Read on `/users/u2`**: `u1` reading `/users/u2` -> DENIED.
6. **Ghost Field Shadow Write on `/riders/u1`**: adding `isVerified: true` -> DENIED (`hasOnly`).
7. **ID Poisoning**: creating `/deliveries/bad!id$` or 200-char ID -> DENIED (`isValidId`).
8. **Forged `createdAt` Timestamp**: creating `/deliveries/d1` with `createdAt: Timestamp(2020-01-01)` -> DENIED (`request.time`).
9. **Identity Spoofing on `/deliveries/d1`**: `u1` creating delivery with `createdByUid: 'u2'` -> DENIED.
10. **Terminal State Mutation**: rider updating a `'delivered'` delivery back to `'pending'` -> DENIED.
11. **Non-Admin Tariff Tampering**: rider writing `/settings/tariffs` -> DENIED.
12. **Orphaned Transaction Injection**: rider creating `/transactions/t1` with non-existent `deliveryId: 'fake_del'` -> DENIED (`exists`).
