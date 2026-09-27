# Live verification

The map, live MTA feeds, Photon/Grok reporting, and Solana payout are separate proof boundaries. A successful devnet payout below does not establish an actual rider report or a completed Grok routine. See `artifacts/live-readiness.json` for the read-only transport audit and `docs/rider-rewards.md` for the actual rider workflow.

## Read-only payout readiness

Use the approved **devnet-only backend** keypair file; never paste its contents into a terminal command, document, or chat. The verifier reads `SOLANA_KEYPAIR_PATH` directly and prints only public addresses and balances.

```sh
SOLANA_KEYPAIR_PATH=/absolute/path/to/devnet-backend-keypair.json node --env-file=.env --import tsx scripts/verify-live-payout.ts
```

Without `--execute`, this only checks the fixed Solana devnet genesis, official Circle USDC account and balance, fee payer balance, and MongoDB configuration presence. It does not sign, create a recipient, write a database, or transfer. Readiness requires at least 1 test USDC and 0.0021 devnet SOL. Circle USDC funding and SOL fee funding are separate.

## Real devnet transfer with fixture evidence

Once funded, explicitly run:

```sh
SOLANA_KEYPAIR_PATH=/absolute/path/to/devnet-backend-keypair.json node --env-file=.env --import tsx scripts/verify-live-payout.ts --execute
```

This uses the real rewards, wallet binding, MongoDB repository, payout service, and Solana adapter. The report, moderator evidence, identity, and station are clearly synthetic. It creates one isolated campaign with a 1-test-USDC allocation and pays its 0.6-test-USDC discovery credit to a new recipient. The sender also funds recipient token-account rent and transaction fees, capped by a 2,100,000-lamport reservation.

A dedicated database named `exitnow_live_payout_fixture_<random-id>` preserves the report, ledger, wallet nonce, signed transaction, and payout history. Existing application databases are untouched. The generated recipient keypair and run journal persist under ignored `.data/live-payout-verification/`, with directory mode 0700 and files mode 0600. The keypair never appears in output or committed evidence.

The verifier checks duplicate claims, closes and reopens MongoDB, reconstructs services, and reconciles the original signature. It verifies the finalized recipient token balance increased by precisely 600,000 base units, the ledger settled, and another claim cannot pay again. Evidence is written to `artifacts/live-payout-verification.json`; a submitted explorer link is not called finalized until the real receipt is checked.

Rerunning uses the same database, recipient, and original signed transaction. It never creates a replacement payout. If the 120-second reconciliation window expires, exit status 2 means incomplete: rerun the identical command. Do not delete the journal, recipient, or database while settlement is uncertain. A crash may leave `run.lock`; remove only that lock after verifying no verifier process is active. Preserve all other state for reconciliation.

## Actual messaging proof

The read-only audit found a healthy live gateway and active Photon subscription. Previously recorded delivery had a recipient-allowlist rejection; verify the consenting test rider is registered in Photon. An old uncertain outbox entry requires operator reconciliation, never a blind resend.

Verify the saved Grok routine is active, includes the current reward instructions, and can invoke the authenticated gateway tool endpoint. Send a real fresh observation from the consenting rider, confirm the callback and reply on the device, and use real independent evidence for its moderator decision. An accepted webhook or synthetic fixture must not be presented as this live flow. No Photon message is sent by the payout verifier.

## Latest local verification

The production build and all 105 regression tests passed. In-browser tests loaded actual OpenStreetMap tiles, returned a live Columbia–Times Square MTA itinerary, and opened a real Mongo-backed authenticated rewards account. Map and rewards phone layouts had a 390px document width at a 390px viewport. Current screenshots are in `artifacts/design-live/`; reward captures show an empty smoke-test account, not fixture earnings.

The approved backend signer holds 20 test USDC, but zero devnet SOL at the latest check. The official faucet CAPTCHA needs user action or explicit confirmation before completion. No live payout has been sent. The payout script passed separate security review and is ready after fee funding. Actual Photon/Grok inbound-to-reply reporting remains unverified this turn; read-only provider checks are not an end-to-end messaging claim.

The geographic map uses Leaflet and a configurable public tile provider. Keep provider attribution visible and follow its usage policy; the default OpenStreetMap service is best effort. `NEXT_PUBLIC_MAP_TILE_URL` and `NEXT_PUBLIC_MAP_ATTRIBUTION` are public build-time values, never secrets. Static line geometry has separate MTA provenance and does not assert current service or vehicle position.
