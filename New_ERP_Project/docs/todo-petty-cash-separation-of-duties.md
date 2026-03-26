# TODO: Petty Cash — Separation of Duties

## Issue

`CENTER_MANAGER`, `FINANCE_MANAGER`, and `ACCOUNTANT` all hold both
`PETTY_CASH_CREATE` and `PETTY_CASH_APPROVE` permissions.
This means the **same person can submit a voucher and then approve it**, which
violates basic financial controls.

## Risk

- A single user can create a fraudulent expense and self-approve it.
- No independent review occurs before the journal entry is auto-posted to GL.
- Auditors (internal or external) will flag this as a control weakness.

## Proposed Fix

### Backend (`petty-cash.js` — approve endpoint)

Add a check immediately after fetching the voucher:

```js
if (v.created_by && req.user?.id && v.created_by === req.user.id) {
  await client.query('ROLLBACK');
  return res.status(403).json({
    error: 'You cannot approve a voucher you submitted'
  });
}
```

Apply the same check to the reject endpoint.

### Frontend (`PettyCash.jsx`)

Hide the Approve / Reject buttons when the logged-in user is the submitter:

```jsx
// In the VoucherRow component, where showActions is evaluated:
const showActions =
  has('PETTY_CASH_APPROVE') &&
  v.status === 'SUBMITTED' &&
  v.created_by !== user?.id;   // ← add this
```

### Database (optional — belt-and-suspenders)

Add a CHECK constraint to `expense_records`:

```sql
ALTER TABLE expense_records
  ADD CONSTRAINT chk_no_self_approval
  CHECK (approved_by IS NULL OR approved_by <> created_by);
```

## Roles Affected

| Role | Has CREATE | Has APPROVE | Currently Can Self-Approve |
|---|---|---|---|
| CENTER_MANAGER | ✅ | ✅ | ✅ needs fix |
| FINANCE_MANAGER | ✅ | ✅ | ✅ needs fix |
| ACCOUNTANT | ✅ | ✅ | ✅ needs fix |

## Decision Required

- Should `SUPER_ADMIN` / `ALL_ACCESS` users be exempt from this rule?
- Should the DB constraint be added (makes it unbreakable even if code is bypassed)?

## Priority

**HIGH** — Financial control gap. Fix before auditors review the system.
