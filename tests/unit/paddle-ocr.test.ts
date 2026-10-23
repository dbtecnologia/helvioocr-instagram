import { describe, expect, it } from "vitest";
import { extractOcrCandidatesFromLayout } from "@/lib/extraction";

describe("PaddleOCR layout extraction", () => {
  it("associates prices to the nearest flyer product column", () => {
    const box = (left: number, top: number, right: number, bottom: number) => [[left, top], [right, top], [right, bottom], [left, bottom]];
    const result = extractOcrCandidatesFromLayout([
      { text: "COX�O MOLE BOVINO", box: box(5, 160, 206, 187) },
      { text: "LAGARTO BOVINO", box: box(242, 153, 355, 170) },
      { text: "PERNIL SU�NO", box: box(409, 151, 503, 168) },
      { text: "SEM OSSO", box: box(422, 165, 491, 179) },
      { text: "$44,99", box: box(25, 395, 219, 501) },
      { text: "39,99", box: box(248, 261, 368, 315) },
      { text: "15,99", box: box(410, 261, 519, 313) },
      { text: "kg", box: box(338, 290, 363, 311) },
      { text: "kg", box: box(495, 292, 518, 311) },
    ]);

    expect(result.map((item) => [item.nome, item.preco])).toEqual([
      ["LAGARTO BOVINO", 39.99],
      ["PERNIL SUÍNO SEM OSSO", 15.99],
      ["COXÃO MOLE BOVINO", 44.99],
    ]);
  });

  it("associates a compact OCR price such as 699", () => {
    const box = (left: number, top: number, right: number, bottom: number) => [[left, top], [right, top], [right, bottom], [left, bottom]];
    const result = extractOcrCandidatesFromLayout([
      { text: "SALSICHA HOT DOG", box: box(10, 20, 180, 45) },
      { text: "699", box: box(20, 60, 100, 95) },
      { text: "cada", box: box(105, 72, 145, 90) },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ nome: "SALSICHA HOT DOG", preco: 6.99 });
  });
});
