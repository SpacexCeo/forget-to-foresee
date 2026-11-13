# Prepare the recording account (owner only; no key material in this repository)

The portal shot (V9) pays the Gate-Loom with **real silk on NEAR testnet**. The demo seed never fakes on-chain silk, so
the recording browser's player account is topped up first.

1. Open the game once in the recording browser profile so the player account is created. Copy its account id from
   **Settings → Account** (it looks like `<name>-<id>.guests.ftf-coordinator.testnet`).
2. With the coordinator key on your own machine (never in the repo), register the account if it is new, then credit
   220 silk (1 silk = 1,000,000 micro-units). Replace the placeholders:

   ```bash
   near contract call-function as-transaction ftf-town.testnet register \
     json-args '{"accounts":["<ACCOUNT_ID>"]}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
     sign-as <COORDINATOR_ACCOUNT> network-config testnet sign-with-keychain send

   near contract call-function as-transaction ftf-town.testnet credit_silk \
     json-args '{"account_id":"<ACCOUNT_ID>","amount":"220000000","reference":"demo"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
     sign-as <COORDINATOR_ACCOUNT> network-config testnet sign-with-keychain send
   ```

3. Check the price the gate will charge (the game reads the same value):

   ```bash
   near contract call-function as-read-only ftf-town.testnet gate_price json-args '{}' network-config testnet now
   ```

4. Reload the game: the silk chip shows the on-chain amount, enough for the Gate price.
5. After the recording the silk is spent by the portal payment (`pay_gate_for`); nothing else to clean up.
