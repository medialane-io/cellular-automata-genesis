import { GRID_SIZE, ITERATIONS } from "./automaton";

export interface PieceMetadata {
  name: string;
  description: string;
  image: string;
  attributes: { trait_type: string; value: string | number }[];
}

export function buildMetadata(index: number, seed: bigint, imageUri: string): PieceMetadata {
  return {
    name: `Cellular Automata Genesis #${index}`,
    description: "A deterministic cellular-automata piece generated from a keccak-derived seed.",
    image: imageUri,
    attributes: [
      { trait_type: "Seed", value: seed.toString() },
      { trait_type: "Grid Size", value: GRID_SIZE },
      { trait_type: "Iterations", value: ITERATIONS },
    ],
  };
}
