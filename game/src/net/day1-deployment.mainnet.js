// Day 1 (free mint) deployment on NEAR mainnet: the account ids from net/network.js; the guest key's public part is
// written by contracts/scripts/day1-guest-key.sh (FTF_NEAR_NETWORK=mainnet) after the mainnet deploy
// (docs/deploy/mainnet.md). Never a private key.
export const DAY1_DEPLOYMENT_MAINNET = {
  "network": "mainnet",
  "heroine": "heroine.ftf-coordinator.near",
  "companions": "companions.ftf-coordinator.near",
  "guests": "guests.ftf-coordinator.near",
  "guestKeyAccount": "guests.ftf-coordinator.near",
  "guestKeyPublic": null,
  "agents": "agents.ftf-coordinator.near",
  "ledger": "ledger.ftf-coordinator.near",
  "relayer": "https://159-195-130-113.sslip.io",
  "chests": "chests.ftf-coordinator.near",
  "skins": "skins.ftf-coordinator.near",
  "presence": "wss://159-195-130-113.sslip.io/presence",
  "town": "ftf-town.near",
  "items": "items.ftf-town.near"
};
