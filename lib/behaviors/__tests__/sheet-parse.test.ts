// Hello World
import { deflateRawSync } from "zlib";
import { describe, expect, it } from "vitest";
import { parseCsv, parseXlsx, rowsToCompanies } from "@/lib/behaviors/sheet-parse";

/** ZIP mínimo (como o Excel grava): cabeçalhos locais + diretório central + fim. */
function zip(files: Record<string, string>): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content, "utf8");
    const data = deflateRawSync(raw);
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, end]));
}

describe("leitura de planilhas de empresas", () => {
  it("CSV com ponto e vírgula, aspas e cabeçalho com acento", () => {
    const csv = 'CNPJ;Razão Social;Nome Fantasia;Categoria;Chaves Pix\n11.222.333/0001-81;"Bet Exemplo; Apostas Ltda";BetExemplo;apostas;pix@bet.com|11988887777\n';
    expect(rowsToCompanies(parseCsv(csv))).toEqual([
      { cnpj: "11.222.333/0001-81", legalName: "Bet Exemplo; Apostas Ltda", tradeName: "BetExemplo", category: "apostas", identifiers: ["pix@bet.com", "11988887777"], notes: "" },
    ]);
  });

  it("lista colada sem cabeçalho usa a ordem CNPJ, razão social, fantasia, categoria", () => {
    expect(rowsToCompanies(parseCsv("11222333000181,Bet Exemplo Ltda,Bet,apostas"))[0]).toMatchObject({ cnpj: "11222333000181", legalName: "Bet Exemplo Ltda", category: "apostas" });
  });

  it("XLSX: textos compartilhados, texto inline e CNPJ numérico sem o zero à esquerda", async () => {
    const xlsx = zip({
      "xl/workbook.xml": '<workbook><sheets><sheet name="Empresas" sheetId="1" r:id="rId1"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/sharedStrings.xml": "<sst><si><t>CNPJ</t></si><si><t>Razão social</t></si><si><t>Mercado &amp; Cia</t></si></sst>",
      "xl/worksheets/sheet1.xml":
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>1234567000189</v></c><c r="B2" t="s"><v>2</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>11222333000181</t></is></c><c r="C3" t="inlineStr"><is><t>sem razão</t></is></c></row></sheetData></worksheet>',
    });
    const table = await parseXlsx(xlsx);
    expect(table).toEqual([["CNPJ", "Razão social"], ["1234567000189", "Mercado & Cia"], ["11222333000181", "", "sem razão"]]);
    expect(rowsToCompanies(table).map((r) => [r.cnpj, r.legalName])).toEqual([
      ["01234567000189", "Mercado & Cia"],
      ["11222333000181", ""],
    ]);
  });
});
