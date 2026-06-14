# Top public keys by transactions/conversions

Query time: 2026-05-28T17:20:55.883Z

Method: counted final/success-like records from `payment_logs` and `operations`, grouped by `source_public_key`, deduplicating by transaction hash when present.

| # | Public key | Total | Ops | Payment logs | Conversions |
|---|---|---:|---:|---:|---:|
| 1 | `GBQIKYCOVHJ54ETPGBIIPES72JN2Y27INUQACPEQNQSKLB2AHYY3RFDS` | 58 | 39 | 16 | 3 |
| 2 | `GACBQBHZLFDCTSUGVH4LB73FQ7LHRB4W7RAWXY2TNP2Z374TNVWVTUQM` | 30 | 26 | 3 | 1 |
| 3 | `GDS5DQONHNVG2JDZSMTATOIOGGCQV6ZTKWLJ755QUBRY7YSAMDITZOJ6` | 24 | 24 | 0 | 0 |
| 4 | `GAQCUQOCZ57TVS2TH6UQBGCYLFW7DJTSIAPD7CYG7Y6WHCZF27XXFN5F` | 14 | 14 | 0 | 0 |
| 5 | `GD5AFX74BKNGP3UPN37MKHBNP2VFO2PQR75DFQAWP24WICOWPKJB6F5H` | 11 | 11 | 0 | 0 |

Rows scanned:

| Table | Rows |
|---|---:|
| `payment_logs` | 56 |
| `operations` | 1246 |
