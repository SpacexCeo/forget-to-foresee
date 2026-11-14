// The season-commit deployment this build reads: the record for the network chosen in net/network.js
// (VITE_FTF_NEAR_NETWORK). The records themselves are written by contracts/season-commit/scripts/write-deployment.mjs.
import { NEAR_NETWORK } from './network.js';
import { NEAR_DEPLOYMENT_TESTNET } from './near-deployment.testnet.js';
import { NEAR_DEPLOYMENT_MAINNET } from './near-deployment.mainnet.js';

export const NEAR_DEPLOYMENT = NEAR_NETWORK === 'mainnet' ? NEAR_DEPLOYMENT_MAINNET : NEAR_DEPLOYMENT_TESTNET;
