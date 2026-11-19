import { describe, expect, it } from "vitest";
import { isDiscontinuedName } from "../wms-stock";

describe("isDiscontinuedName — penanda barang (DC)", () => {
  it("menandai nama berawalan (DC)", () => {
    expect(isDiscontinuedName("(DC) 220 VOLT ON FIRE LB (48)")).toBe(true);
    expect(isDiscontinuedName("(DC) WHISKAS TUNA 1.2KG")).toBe(true);
  });

  it("tidak peduli huruf besar/kecil dan spasi di dalam kurung", () => {
    expect(isDiscontinuedName("(dc) FURKIDO FLEA & TICK 10ML")).toBe(true);
    expect(isDiscontinuedName("(DC ) FURKIDO FLEA & TICK 10ML")).toBe(true);
    expect(isDiscontinuedName("( DC ) PEDIGREE ADULT 3KG")).toBe(true);
  });

  it("tetap mendeteksi walau (DC) bukan di awal nama", () => {
    expect(isDiscontinuedName("ROYAL CANIN (DC) URINARY 2KG")).toBe(true);
  });

  it("TIDAK menandai barang aktif yang namanya memuat 'DC' sebagai kata biasa", () => {
    expect(isDiscontinuedName("DC MOTOR 12V POMPA")).toBe(false);
    expect(isDiscontinuedName("FOOD CONTAINER DC-200")).toBe(false);
    expect(isDiscontinuedName("CAT CHOIZE KITTEN SALMON 20KG")).toBe(false);
  });

  it("aman untuk nilai kosong / bukan string", () => {
    expect(isDiscontinuedName("")).toBe(false);
    expect(isDiscontinuedName(undefined)).toBe(false);
    expect(isDiscontinuedName(null)).toBe(false);
    expect(isDiscontinuedName("()")).toBe(false);
    expect(isDiscontinuedName("(D C)")).toBe(false);
  });
});
