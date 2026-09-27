# Rider Rewards

ExitNow pays for useful verified information, not negative claims. All displayed balances are **test USDC on Solana devnet**. Developer funds provide the campaign. Neither MTA nor Solana is represented as a funder.

## Local demonstration

Use Node 22 or later. Run `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, and `npm run demo:rewards`. The last command writes `artifacts/rider-rewards-demo.json` and asserts the complete local report/check/verification/guidance/credit/duplicate flow through the real gateway service. Its transport, transit condition, funding, and moderator evidence are explicitly simulated. It does not submit a blockchain transaction.

`npm run dev` opens the geographic trip planner plus Rider Rewards. `/rewards` is a direct rider entry point; `/rewards/review` is the authenticated moderator workspace. `node scripts/check-rewards-ui.mjs` runs browser checks against port 3001 by default (override `APP_URL`); install its browser with `npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an existing Chromium binary. Filenames containing `fixture` display intercepted UI fixtures, never live account balances.

## Funding and configuration

Copy `.env.example` and keep secrets in ignored `.env`. Configure the existing MongoDB replica set, Photon, and Grok Bot setup. The rewards runtime adds `rider_rewards_state` using the shared transaction implementation.

Set `REWARDS_SESSION_SECRET` and `REWARDS_MODERATOR_TOKEN` to separate random secrets of at least 32 characters. Set `REWARDS_WEB_ORIGIN` to the exact deployed origin. Temporary rider codes are HMAC authenticated, account scoped, and expire after 15 minutes; they are delivered in the rider's private authenticated conversation and entered in the web screen. They stay in page memory, never URL parameters or local storage. The moderator token is a prototype operator credential; protect and rotate it. Production needs individual moderator accounts and revocation.

For a funded campaign, provide a **devnet-only** `SOLANA_SECRET_KEY` JSON byte array. Fund its official Circle USDC associated token account through [Circle's faucet](https://faucet.circle.com/) and fund its SOL fee payer separately. The mint is `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, six decimals, verified from [Circle's official contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses). No synthetic token is created. Mainnet is not supported.

Set `REWARDS_CAMPAIGN_UNITS`, `REWARDS_DAILY_UNITS`, `REWARDS_STATION_UNITS`, and `REWARDS_CATEGORY_UNITS` in integer micro-USDC. A value of 1,000,000 means one test USDC. Funding defaults to zero; initial positive allocation requires a successful devnet USDC balance check. Its funding authority is persisted. Subsequent restarts use the unchanged recorded allocation so transactions that have already moved tokens can still reconcile. The signer must exclusively fund this campaign: spending its tokens elsewhere can make earned payouts unavailable. Allocation is accounting authorization over prefunded tokens, not an on-chain escrow contract.

Set a separate `REWARDS_FEE_BUDGET_LAMPORTS`; zero disables payouts. Defaults: maximum 2,100,000 lamports reserved per payout, one subsidized associated-token-account creation per contributor group, and 100,000 micro-USDC payout threshold. The backend pays fees; riders do not deposit, stake, or buy tokens. Failed preparation can be cancelled **only before any transaction is signed**. Signed or ambiguous transactions remain reserved and are reconciled with the original bytes/signature.

The first positive campaign allocation can follow unpaid use without deleting history. Once funded, the policy is persisted and mismatched worker/restart configurations fail closed. Do not reset collections to change campaign amounts. Top-ups or policy changes require a reviewed additive migration that preserves outstanding liabilities, active reservations, settled totals, and frozen task calculations. Day caps use UTC calendar days. Station and category limits bound the total campaign allocation; the campaign daily limit resets by UTC task-open day. Reservation expiry never reduces an earned credit.

## Reporting, verification, and guidance

The Grok Bot routine must expose the tools documented in [grok-bot.md](grok-bot.md). It extracts category, station, asset/platform/direction as relevant, condition, and observation time. It asks only for missing essentials. `prepare_observation` reserves eligibility and discloses the conditional amount/expiry. Unfunded reports require a later authenticated “submit unpaid” message. A funded quote that expires cannot silently turn into an unpaid submission.

Server-assigned independent checks reveal the target but not the original answer. Checkers can earn for a correct normal-operation report even when discovery was wrong. All payout eligibility comes from deterministic code after official evidence or recorded moderator review. Peer corroboration alone never earns. Freshness: crowding/boarding 10 minutes, elevator/escalator 30 minutes, entrance obstruction 20 minutes; timestamps more than two minutes in the future are rejected. Historical verified truth survives live-guidance expiry.

For each task, coverage counts distinct verified contributor groups in the preceding 60 minutes. The fixed bounty is `500000 + floor(500000 × max(3 − coverage, 0) / 3)` base units. Three slots receive separately floored 60%, 20%, 20%; rounding dust and invalid/unfilled slots remain unpaid. Reward amounts and coverage snapshots freeze at open. Default group daily cap is 2,000,000 units, with at most two active discovery assignments. Negative severity never changes the amount.

Moderators inspect the exact target, claimed/receipt time, evidence references and prior decisions, then record an evidence reference and rationale. Crowding and other unsupported official-source categories use this path. `RewardsService.recordKnownCondition` accepts trusted official adapter input; no equipment-feed collector is included in this prototype. Its official cache prevents advertising rewards for already known conditions once ingested. `authorizeRefresh` is a server/operator-only service API for a recorded refresh/state-change decision; it is never exposed to Grok. Never pass user or model assertions to these trusted interfaces as official evidence.

Verified, fresh observations enter scoped route warnings and rider updates, without asserting accessibility or changing authoritative MTA predictions. Expired notifications are suppressed. The gateway retains its pre-existing synthetic routing boundary. The web planner still uses official MTA predictions. Moderator accounting shows coverage at task opening, evidence, guidance changes, liabilities, and spend per usable observation. Messaging guidance changes are recorded; web warning rendering is not recorded as a private trip history.

## Privacy and abuse boundaries

Application identities come from Photon-authenticated senders. Wallet possession never establishes application identity. Server-configured `REWARDS_ACCOUNT_LINKS_JSON` joins known accounts/sessions into one contributor group before reward assignment; changing that mapping for existing history requires an audited migration. Same-account sessions share limits. Reused evidence and reciprocal checking are flagged, and peer bursts cannot establish verified truth. Shared station Wi-Fi is never an abuse signal. New phone numbers remain a Sybil limitation; this prototype does not solve independent-person identification.

Wallet binding requires an Ed25519 signature over an expiring, single-use domain/network/account-scoped nonce. One account has one wallet; changes have a 24-hour cooldown and are blocked during pending payouts. Wallet changes do not reset history or group caps. Public transfer instructions contain only required token-transfer data, without station details, evidence, phone numbers, report hashes, or trip history. Opaque payout IDs map to private records off-chain. Wallet transfers are public, not anonymous.

The ledger, tasks and payout records are serialized under the MongoDB state-document revision lock and `_id` uniqueness. This is bounded prototype storage, not a production event architecture; partitioning, retention, per-account rate limits, operational monitoring and individual moderator audit identities remain production work. Reports, private evidence and wallet bindings are never returned in the public MTA API. Incentives bias sampling; paid report frequency is not unbiased demand.

## Live end-to-end demonstration

1. Configure and fund devnet, enable the existing live Photon/Grok Bot integration, and apply the updated routine tool instructions.
2. From a consenting rider's actual iMessage conversation, submit a specific fresh observation. Inspect the provisional amount, expiry and calculation before confirmation.
3. From an independent authenticated rider already at that station, request a blind check and report the observed condition.
4. Use `/rewards/review` to inspect real supporting evidence, record a moderator decision, and verify the appropriate trip warning/accounting change.
5. Ask the bot for “my rewards”; use the private temporary code at `/rewards`. Inspect earned test USDC and the explanation.
6. Connect a devnet wallet, sign its ownership nonce, and request an aggregate payout. Reconcile until finalized. Open the explorer link only after a real acknowledged submission.
7. Replay the same observation; verify no additional paid slot or earned amount appears.

**Current proof boundary:** the local demonstration and automated tests run without a live signer. No live Photon/Grok Bot reporting journey or real USDC payout was performed in this change. The user chose local completion with the live payout blocked on signer/funding. `artifacts/rider-rewards-demo.json` labels this explicitly and contains no invented receipt.

## Database verification evidence

`node --env-file=.env --import tsx scripts/verify-rewards-mongo.ts` uses a uniquely named isolated MongoDB test database and removes only its generated rewards collection. It proves one funded reservation under concurrent task creation, one aggregate payout under concurrent claims, and one signing operation across service restart with an ambiguous simulated RPC. See `artifacts/rewards-mongodb-verification.json`. Contending transactions can return bounded retry errors, which callers must retry; the campaign never overcommits. Its rewards, wallet and RPC values are synthetic, not a real transfer.

## Web reporting

Choose **Report a problem** in the main navigation, or visit `/rewards#report`. Enter the private code from `my rewards` to open the form. Provide the station, category, equipment/entrance or platform/direction, observation time, and condition. Review the quoted amount before selecting **Submit report** or **Submit unpaid report**. Submission returns a report reference; verification and earned balance remain separate. No wallet is required to report.

The API derives identity from the authenticated access code, enforces the displayed provisional amount at submission, and deduplicates retry requests by account and submission ID. An expired or changed reservation requires a fresh review; it cannot silently become an unpaid submission. Browser verification uses intercepted fixtures via `node scripts/check-report-ui.mjs`; it sends no messages and creates no real reports.
