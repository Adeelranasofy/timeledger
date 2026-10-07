# TimeLedger backup format (v1)

One backup is one UTF-8 JSON file. The desktop app writes it, and any future TimeLedger app (mobile or web) should read and write the same format, so a backup made on one device can be restored on another.

File name: `TimeLedger-backup_YYYY-MM-DD_HHMMSS[_device][_before-restore].json` (local time of the device that made it).

## Envelope

```json
{
  "format": "timeledger-backup",
  "formatVersion": 1,
  "schemaVersion": 2,
  "app": "TimeLedger",
  "appVersion": "1.0.0",
  "platform": "desktop-win32",
  "deviceId": "6f1c…",
  "deviceName": "Office PC",
  "createdAt": "2026-10-01T09:30:05.120Z",
  "reason": "auto | daily | manual | on-close | first | before-restore",
  "summary": { "workspaces": 2, "employees": 4, "rows": 312 },
  "checksum": "sha256:<hex>",
  "encrypted": false,
  "data": { "…": "the app data, see below" }
}
```

- The header fields come **before** `data` / `ciphertext`, so a reader can list a backup from its first few KB.
- `checksum` is the SHA-256 of `JSON.stringify(data)` (JavaScript serialisation, no spaces). For encrypted backups it is computed over the decrypted plaintext, so it is exact on every platform.
- Readers must refuse `formatVersion` higher than they understand. They should accept older plain data exports, which are the data object itself with optional `exportedAt` / `app` keys.

## Encryption (optional)

When `encrypted` is `true`, `data` is absent and these fields are present instead:

```json
"encryption": { "cipher": "AES-256-GCM", "kdf": "PBKDF2-SHA256", "iterations": 310000,
                "salt": "<base64, 16 bytes>", "iv": "<base64, 12 bytes>", "tag": "<base64, 16 bytes>" },
"ciphertext": "<base64>"
```

key = PBKDF2-HMAC-SHA256(passphrase as UTF-8, salt, iterations, 32 bytes). The plaintext is `JSON.stringify(data)`. These are all standard primitives: Node `crypto`, browser WebCrypto, iOS CryptoKit/CommonCrypto and Android `javax.crypto` can all read them.

## Data (`schemaVersion` 2)

```
settings     currency, number format, default times, timeFormat ("12" | "24") …
workspaces[] { id, name, details, defaultIn, defaultOut, defaultBreak, workDays[], defaultRate }
employees[]  { id, name, email, phone, workspaces: { [workspaceId]: { role, hourlyRate, openingBalance, openingNote } } }
rows         { [workspaceId]: { [employeeId]: row[] } }
               day      { id, type:"day", date, in, out, breakMin, rate, paid, paidAmount, note }
               payment  { id, type:"payment", date, amount, from, to, method, comment, shared[] }
               leave    { id, type:"leave", date, kind:"leave"|"holiday", note }
               note     { id, type:"note", date, text, tone }
groups       { [workspaceId]: { [employeeId]: group[] } }   (optional; absent in older files)
               { id, from, to, label, add[], remove[], collapsed }
               Pay group: the days from..to plus the payments whose from/to lie inside it,
               plus payment ids in add[], minus payment ids in remove[]. Report only; no balance depends on it.
ui           view preferences (safe to ignore)
```

Dates are `YYYY-MM-DD`. Times are 24-hour `HH:MM`, whatever display format is chosen. Money values are plain numbers in the currency in `settings`.

## Where backups live

| Destination | Location |
|---|---|
| Google Drive | Folder **TimeLedger Backups** in My Drive, created by the app (`drive.file` scope, so the app sees only its own files). Each file has `appProperties`: `app`, `formatVersion`, `device`, `deviceId`, `reason`, `encrypted`, `workspaces`, `employees`, `rows`. |
| Folder | `<chosen folder>/TimeLedger Backups/`, e.g. inside OneDrive, Dropbox or iCloud Drive, whose own apps sync it |
| This computer | App data folder → `backups/`: daily raw data copies (`timeledger-YYYY-MM-DD.json`) plus safety copies made before a restore |

A mobile or web app built on the same Google Cloud project (same OAuth project, `drive.file` scope) can see the backups in that Drive folder.
