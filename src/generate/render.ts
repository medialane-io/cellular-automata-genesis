const CELL_SIZE = 10;
const FG = "#111111";
const BG = "#f5f5f5";

export function renderSvg(grid: boolean[][]): string {
  const width = (grid[0]?.length ?? 0) * CELL_SIZE;
  const height = grid.length * CELL_SIZE;
  const cells = grid
    .flatMap((row, y) =>
      row.map((alive, x) =>
        alive
          ? `<rect x="${x * CELL_SIZE}" y="${y * CELL_SIZE}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="${FG}"/>`
          : ""
      )
    )
    .filter(Boolean)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${BG}"/>${cells}</svg>`;
}
