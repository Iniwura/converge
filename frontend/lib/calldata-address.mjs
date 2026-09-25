import { CalldataAddress } from "genlayer-js/types";
import { hexToBytes } from "viem";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function toCalldataAddress(value) {
  if (typeof value !== "string" || !ADDRESS_PATTERN.test(value)) {
    throw new Error("Wallet address must be a 20-byte hexadecimal address.");
  }
  return new CalldataAddress(hexToBytes(value));
}

export function readHasSubmitted(readMethod, objectiveId, address) {
  return readMethod("has_submitted", [objectiveId, toCalldataAddress(address)]);
}
