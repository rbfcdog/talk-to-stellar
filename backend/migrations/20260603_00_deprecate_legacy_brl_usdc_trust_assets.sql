-- PIX settles reais as TESOURO. Legacy BRL issuances and old testnet USDC
-- seeds must not be treated as default trusted assets for new trustlines.

UPDATE whitelisted_assets
SET trusted = false
WHERE asset_code IN ('BRL', 'USDT', 'CNY')
   OR (asset_code = 'USDC' AND asset_issuer IN (
     'GBBD47UZQ2BNTO32V36DP7RQ75P463MCFC7RQVZGVZBULXE72DYOJJL',
     'GBBD47UZQ5PBC7BY76I3PN4RYSEE3U2IRVIB42IXLKNVGIZCMARVEL6'
   ));

INSERT INTO whitelisted_assets (asset_code, asset_issuer, trusted)
VALUES ('TESOURO', 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4', true)
ON CONFLICT (asset_code) DO UPDATE
SET asset_issuer = EXCLUDED.asset_issuer,
    trusted = true;
