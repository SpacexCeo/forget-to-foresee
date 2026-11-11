// Day 1 (free mint) deployment on NEAR testnet: public account ids and the guest key's public part, written by
// contracts/scripts/day1-*.sh. Never a private key: the guest key's secret is in the build environment (VITE_FTF_GUEST_KEY).
export const DAY1_DEPLOYMENT = {
  "network": "testnet",
  "heroine": "heroine.ftf-coordinator.testnet",
  "companions": "companions.ftf-coordinator.testnet",
  "guests": "guests.ftf-coordinator.testnet",
  "guestKeyAccount": "guests.ftf-coordinator.testnet",
  "guestKeyPublic": "ed25519:3aViGk5NRgNqojA67rNfUqN5g7VyGkDXYZytfvuHyPgA",
  "agents": "agents.ftf-coordinator.testnet",
  "ledger": "ledger.ftf-coordinator.testnet",
  "relayer": "https://159-195-130-113.sslip.io"
};
