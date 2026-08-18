import { expect, test } from "bun:test";
import { renderSvg } from "./render";

test("same grid renders identical SVG bytes", () => {
  const grid = [
    [true, false],
    [false, true],
  ];
  expect(renderSvg(grid)).toBe(renderSvg(grid));
});

test("output is a well-formed svg element", () => {
  const grid = [[true]];
  const svg = renderSvg(grid);
  expect(svg.startsWith("<svg")).toBe(true);
  expect(svg.endsWith("</svg>")).toBe(true);
});

test("an all-dead grid still renders a valid svg with no rect cells", () => {
  const grid = [
    [false, false],
    [false, false],
  ];
  const svg = renderSvg(grid);
  expect(svg).toContain("<svg");
  expect(svg.match(/<rect/g)?.length).toBe(1);
});
