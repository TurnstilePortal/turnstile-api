import { getAddress, isAddress } from "viem";

export function normalizeL1Address(address: string): string {
  if (!isAddress(address)) {
    throw new Error(`Invalid L1 address: ${address}`);
  }
  return getAddress(address).toLowerCase();
}

export function normalizeL2Address(address: string): string {
  if (!address.startsWith("0x") || address.length !== 66) {
    throw new Error(`Invalid L2 address: ${address}`);
  }
  return address.toLowerCase();
}

export function isL2Address(address: string): boolean {
  return address.startsWith("0x") && address.length === 66;
}

// Re-export viem's isAddress as isL1Address for semantic clarity
export { isAddress as isL1Address } from "viem";
