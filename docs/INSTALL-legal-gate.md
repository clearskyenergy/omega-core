# Signing gate + new-account apps — install notes

Two changes to the salesdemo repo:

1. Every new account must sign the Terms of Service and the NDA before the portal opens.
2. New accounts land with Grid Atlas and the Financing Partners Portal already in My Applications.

---

## Files

| File | State | What it is |
|---|---|---|
| `omega-legal-docs.js` | **new** | The two agreements, as plain text. No logic. Give this one to your attorney. |
| `omega-legal.js` | **new** | The signing gate: renders the documents, enforces scroll + tick + typed signature, writes the record. |
| `firestore-rules-legal.txt` | **new** | Rules for `legal_acceptances`. Merge into your existing ruleset. |
| `index.html` | **patched** | Loads the two scripts; auth now routes through the gate; sidebar shows custom tools. |
| `config.js` | **patched** | `newAccountDefaults` — what a brand-new workspace starts with. |
| `omega-brand.js` | **patched** | `autoTenant()` overlays `newAccountDefaults`. |

Everything else in the repo is untouched.

---

## Deploy

**1. Drop the files in.** Copy all six over the repo, commit, push. Vercel picks it up.

**2. Deploy the Firestore rules.** This is not optional — without the rules the write is rejected and nobody gets past the gate.

Open `firestore-rules-legal.txt`, merge the `legal_acceptances` block into your existing `firestore.rules` for the `clearsky-portal` project (do not replace the file), then:

```
firebase deploy --only firestore:rules
```

**3. Check the tool keys.** `config.js` declares Grid Atlas as `grid_atlas` and the financing portal as `financing`. If `omega-tools.js` already carries either tool under a key, use *that* key in `requiredTools` and the catalog entry wins automatically — the `customTools` entry is only a fallback for a key the catalog lacks. If the keys don't match you'll ship two tiles for the same tool.

**4. Test with a throwaway account.** Create one, confirm you cannot get past the gate without scrolling both documents, then confirm the record lands in Firestore under `legal_acceptances/{uid}__2026-09-02`.

---

## How the gate behaves

- Runs after Firebase auth and after the workspace resolves, before the portal renders.
- Already signed the current version → straight through, no interruption.
- Not signed, or signed an older version → gate.
- Declines → signed straight back out.
- `omega-legal-docs.js` fails to load → **nobody gets in.** Fails closed, on purpose.
- Firestore write fails → the user stays on the gate with an error. No record, no access.

## Changing the agreements

Edit `omega-legal-docs.js` and **bump `version`**. Every account that signed an older version is asked to sign again on their next visit; the old record stays intact and readable. Never change wording without bumping — that's the whole evidentiary point.

Version format is `YYYY-MM-DD`, with `-b`, `-c` for a second change on the same day.

## Pulling a signature when you need it

Records live at `legal_acceptances/{uid}__{version}`. Each one holds the signer's name, entity, title, email, account id, server timestamp, user agent, and the **full text of both documents as they appeared on screen**, plus per-document and bundle hashes.

Staff on `@csebuilders.com` or `@clearsky-usa.com` (with verified email) can read all records. Nobody can update or delete one, including you — if you need that, do it from the Firebase console with admin credentials, and expect to explain why in any dispute.

Signers get an HTML copy downloaded automatically at signature, and can grab an unsigned copy from the gate before signing.

---

## Two things to fix before this protects anything real

**Anyone can still sign up.** `config.js` has no `tenant` block, so `autoTenant()` hands any email domain its own workspace. A signature from a throwaway address naming "Acme LLC" is close to unenforceable — you can't serve it. Either:

- set `strictTenant: true` and add a `tenant` block per customer (see `config.example.js`), or
- at minimum require `user.emailVerified` before calling `OmegaLegal.require`, and refuse free-mail domains.

**No watermarking yet.** ToS §10 already has the consent language for it. Implementing it — per-tenant canary tokens in served pages and exports — is what turns "someone took this" into "*this account* took this." That's the difference between a suspicion and a case.

---

## Not legal advice

The agreements are a drafting starting point, not a lawyer's work product. Have an Iowa-licensed attorney review before this gates a real customer. The parts most worth their time: NDA §5 (reverse engineering and derivative development), §2's trade-secret framing, the liability cap in ToS §13, and whether you want Iowa venue or arbitration.
