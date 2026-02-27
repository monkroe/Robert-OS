# AI Start Here (Robert OS)

Before proposing changes, read and follow:
- `monkroe/robert-os-hub/AI-PLAYBOOK.md` (canonical protocol)
- Hub docs: `docs/01-vision.md`, `docs/03-architecture.md`, `docs/04-data-model.md` (system rules)

## Constitution (LOCKED)
- `TRANSACTIONS` table = **General Ledger** = the only financial source of truth.
- **Only Cockpit writes** data. All other tabs are read-only views.
- Tabs are independent modules: **no cross-tab business logic**.
- **Soft delete only** (`deleted_at`): never physically delete financial data.
- `tx_class = 'transfer'` is **always excluded** from P&L calculations.
- OS-first: the system must work 100% without BENAS bot.

## Working protocol (LOCKED)
- One step at a time; stop and wait for user **"Done"**.
- No code/patch/SQL unless explicitly commanded.
- Minimal blast radius: small diffs, small commits.
- Always inspect current code before editing (`rg`, `sed -n`, `nl -ba`).

## Language policy
- UI text can be Lithuanian.
- Code/commit messages should be English.

## Default next step
Start with inspection (show the exact file section), then propose ONE command/change.
