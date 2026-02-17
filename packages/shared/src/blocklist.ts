/**
 * OFAC SDN (Specially Designated Nationals) Ethereum address blocklist.
 *
 * Sources:
 * - US Treasury OFAC SDN List: https://sanctionssearch.ofac.treas.gov/
 * - Tornado Cash sanctioned addresses (Aug 2022, Nov 2022 updates)
 * - Lazarus Group / DPRK-attributed wallets
 * - Blender.io mixer addresses
 *
 * Last updated: 2026-02-17
 */

const BLOCKED_ADDRESSES: ReadonlySet<string> = new Set([
  // --- Tornado Cash Router & Governance ---
  "0xd90e2f925da726b50c4ed8d0fb90ad053324f31b",
  "0xd96f2b1ef7f5e29d2b5e9afe7e0b4f9c5c3c5f7a",

  // --- Tornado Cash Proxy (OFAC Aug 8, 2022) ---
  "0x722122df12d4e14e13ac3b6895a86e84145b6967",
  "0xdd4c48c0b24039969fc16d1cdf626eab821d3384",
  "0xd4b88df4d29f5cedd6857912842cff3b20c8cfa3",
  "0x910cbd523d972eb0a6f4cae4618ad62622b39dbf",
  "0xa160cdab225685da1d56aa342ad8841c3b53f291",
  "0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144",
  "0xf60dd140cff0706bae9cd734ac3683731eb5bb98",
  "0x22aaa7720ddd5388a3c0a3333430953c68f1849b",
  "0xba214c1c1928a32bffe790263e38b4af9bfcd659",
  "0xb1c8094b234dce6e03f10a5b673c1d8c69739a00",
  "0x527653ea119f3e6a1f5bd18fbf4714081d7b31ce",
  "0x58e8dcc13be9780fc42e8723d8ead4cf46943df2",
  "0xd691f27f38b395864ea86cfc7253969b409c362d",
  "0xaeaac358560e11f52454d997aaff2c5731b6f8a6",
  "0x1356c899d8c9467c7f71c195612f8a395abf2f0a",
  "0xa60c772958a3ed56c1f15dd055ba37ac8e523a0d",
  "0x169ad27a470d064dede56a2d3ff727986b15d52b",
  "0x0836222f2b2b24a3f36f98668ed8f0b38d1a872f",
  "0x12d66f87a04a9e220743712ce6d9bb1b5616b8fc",
  "0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936",
  "0x23773e65ed146a459791799d01336db287f25334",
  "0xd21be7248e0197ee08e0c20d4a398aced3340e1c",
  "0x610b717796ad172b316836ac95a2ffad065ceab4",
  "0x178169b423a011fff22b9e3f3abea13261472cc7",
  "0xbb93e510bbcd0b7beb5a853875f9ec60275cf498",
  "0x2717c5e28cf931733106c13dceee9bc0b5d03f39",

  // --- Tornado Cash Nova (Gnosis Chain bridge) ---
  "0x905b63fff5e043f1a28c0cdc6198c9b5e7a8b4f2",

  // --- Lazarus Group / DPRK-attributed wallets ---
  "0x098b716b8aaf21512996dc57eb0615e2383e2f96",
  "0xa0e1c89ef1a489c9c7de96311ed5ce5d32c20e4b",
  "0x3cffd56b47b7b41c56258d9c7731abadc360e460",
  "0x53b6936513e738f44fb50d2b9476730c0ab3bfc1",
  "0x35fb6f6db4fb05e6a4ce86f2c93270f0461b11f3",
  "0xf7b31119c2682c88d88d455dbb9d5932c65cf1be",
  "0x3cbded43efdaf0fc77b9c55f6fc9988fcc9b757d",
  "0x72a5843cc08275c8171e582972aa4fda8c397b2a",
  "0x7f367cc41522ce07553e823bf3be79a889debe1b",
  "0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b",
  "0x901bb9583b24d97e995513c6778dc6888ab6870e",
  "0xa7e5d5a720f06526557c513402f2e6b5fa20b008",
  "0x8589427373d6d84e98730d7795d8f6f8731fda16",
  "0x0583a7746a7339a65ddb41fdeb6e089a089fae3f",

  // --- Blender.io ---
  "0x8576acc5c05d6ce88f4e49bf65bdf0c62f91353c",
  "0xd0975b32cea532eadddfc1c60e3e8e9c107a7984",

  // --- Garantex exchange ---
  "0x6f1ca141a28907f78ebaa64f83078deb6f2c7bf4",

  // --- Additional OFAC-designated addresses ---
  "0x7ff9cfad3877f21d41da833eb7f3c97265162c63",
  "0x19aa5fe80d33a56d56c78e82ea5e50e5d80b4dff",
  "0xc455f7fd3e0e12afd51fba5c106909934d8a0e4a",
  "0xfec8a60023265364d066a1212fde3930f6ae8da7",
]);

/**
 * Check if an Ethereum address appears on the OFAC SDN blocklist.
 * Comparison is case-insensitive.
 */
export function isBlockedAddress(address: string): boolean {
  return BLOCKED_ADDRESSES.has(address.toLowerCase());
}
