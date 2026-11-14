// The Day 1 deployment this build uses: the record for the network chosen in net/network.js (VITE_FTF_NEAR_NETWORK).
// The records are written by contracts/scripts/day1-write.mjs.
import { NEAR_NETWORK } from './network.js';
import { DAY1_DEPLOYMENT_TESTNET } from './day1-deployment.testnet.js';
import { DAY1_DEPLOYMENT_MAINNET } from './day1-deployment.mainnet.js';

export const DAY1_DEPLOYMENT = NEAR_NETWORK === 'mainnet' ? DAY1_DEPLOYMENT_MAINNET : DAY1_DEPLOYMENT_TESTNET;
