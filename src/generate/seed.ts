import { hash } from "starknet";

export function deriveSeed(salt: string, index: number): bigint {
  return hash.starknetKeccak(`${salt}:${index}`);
}
