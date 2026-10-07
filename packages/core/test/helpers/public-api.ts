/**
 * Reads the public API of an entry point with the TypeScript compiler: the names a consumer can
 * import, their declarations (as `.d.ts` text, without comments or bodies) and whether each has
 * TSDoc. Used by the API snapshot, the TSDoc and the docs tests.
 */
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export interface ApiExport {
  name: string;
  /** "value" for functions, classes and constants, "type" for interfaces and type aliases. */
  kind: "value" | "type" | "value+type";
  /** Declaration text as it appears in the published `.d.ts` files. */
  declaration: string;
  documented: boolean;
  /** The text after `@deprecated`, when the export is deprecated. */
  deprecated: string | undefined;
  /** `@beta` exports are advanced API that may change in a minor release. */
  beta: boolean;
}

export interface PublicApi {
  exports: ApiExport[];
  /** Types the exports refer to that are not exported by name (shown in the snapshot). */
  reachable: Array<{ name: string; declaration: string }>;
}

let cached: { program: ts.Program; dts: Map<string, ts.SourceFile> } | undefined;

function setup() {
  if (cached) return cached;
  const configPath = join(root, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const options: ts.CompilerOptions = {
    ...parsed.options,
    noEmit: false,
    declaration: true,
    emitDeclarationOnly: true,
    declarationMap: false,
    sourceMap: false,
  };
  const program = ts.createProgram(
    parsed.fileNames.filter((f) => f.includes("/src/")),
    options,
  );
  const dts = new Map<string, ts.SourceFile>();
  program.emit(
    undefined,
    (fileName, text) => {
      if (fileName.endsWith(".d.ts"))
        dts.set(
          fileName,
          ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
        );
    },
    undefined,
    true,
  );
  cached = { program, dts };
  return cached;
}

function dtsFor(sourceFile: ts.SourceFile): ts.SourceFile | undefined {
  const { dts } = setup();
  const rel = relative(root, sourceFile.fileName).replace(/\.ts$/, ".d.ts");
  for (const [name, file] of dts) {
    if (name.replace(/\\/g, "/").endsWith(`/${rel.replace(/\\/g, "/")}`) || name.endsWith(rel))
      return file;
  }
  return undefined;
}

function statementName(s: ts.Statement): string | undefined {
  if (
    ts.isFunctionDeclaration(s) ||
    ts.isClassDeclaration(s) ||
    ts.isInterfaceDeclaration(s) ||
    ts.isTypeAliasDeclaration(s) ||
    ts.isEnumDeclaration(s)
  )
    return s.name?.text;
  if (ts.isVariableStatement(s)) {
    const d = s.declarationList.declarations[0];
    return d && ts.isIdentifier(d.name) ? d.name.text : undefined;
  }
  return undefined;
}

const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });

function print(statement: ts.Statement, file: ts.SourceFile): string {
  return printer
    .printNode(ts.EmitHint.Unspecified, statement, file)
    .replace(/^export declare /, "")
    .replace(/^export /, "")
    .replace(/^declare /, "")
    .replace(/\r/g, "")
    .trim();
}

function declarationsNamed(name: string, sourceFile: ts.SourceFile): string[] {
  const file = dtsFor(sourceFile);
  if (!file) return [];
  return file.statements.filter((s) => statementName(s) === name).map((s) => print(s, file));
}

/** Public API of an entry file, relative to `packages/core`, e.g. `src/index.ts`. */
export function publicApi(entry: string): PublicApi {
  const { program } = setup();
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(join(root, entry));
  if (!source) throw new Error(`No such entry: ${entry}`);
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) throw new Error(`${entry} is not a module`);

  const exportedKeys = new Set<string>();
  const out: ApiExport[] = [];
  const seenDeclarations = new Set<string>();
  const reachable = new Map<string, string>();

  const visitTypes = (node: ts.Node) => {
    if (ts.isBlock(node)) return;
    let id: ts.Node | undefined;
    if (ts.isTypeReferenceNode(node)) id = node.typeName;
    else if (ts.isExpressionWithTypeArguments(node)) id = node.expression;
    else if (ts.isTypeQueryNode(node)) id = node.exprName;
    if (id) {
      const leaf = ts.isQualifiedName(id) ? id.right : id;
      let symbol = checker.getSymbolAtLocation(leaf);
      if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
      for (const d of symbol?.declarations ?? []) {
        const file = d.getSourceFile();
        if (!file.fileName.startsWith(join(root, "src"))) continue;
        const name = symbol?.getName() ?? "";
        if (!name || exportedKeys.has(name) || reachable.has(name)) continue;
        if (
          !ts.isInterfaceDeclaration(d) &&
          !ts.isTypeAliasDeclaration(d) &&
          !ts.isClassDeclaration(d)
        )
          continue;
        const text = declarationsNamed(name, file).join("\n");
        reachable.set(name, text);
        visitTypes(d);
      }
    }
    ts.forEachChild(node, visitTypes);
  };

  for (const exported of checker.getExportsOfModule(moduleSymbol))
    exportedKeys.add(exported.getName());

  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const target =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const decls = target.declarations ?? [];
    const isType = !!(
      target.flags &
      (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Enum)
    );
    const isValue = !!(
      target.flags &
      (ts.SymbolFlags.Function |
        ts.SymbolFlags.Class |
        ts.SymbolFlags.Variable |
        ts.SymbolFlags.Enum)
    );
    const name = exported.getName();
    const lines: string[] = [];
    for (const d of decls) {
      const file = d.getSourceFile();
      const key = `${file.fileName}:${name}`;
      if (seenDeclarations.has(key)) continue;
      seenDeclarations.add(key);
      lines.push(...declarationsNamed(target.getName(), file));
      visitTypes(d);
    }
    const tags = target.getJsDocTags(checker).map((t) => t.name);
    const doc = ts.displayPartsToString(target.getDocumentationComment(checker)).trim();
    out.push({
      name,
      kind: isType && isValue ? "value+type" : isType ? "type" : "value",
      declaration: lines.join("\n"),
      documented: doc.length > 0,
      deprecated: tags.includes("deprecated")
        ? ts.displayPartsToString(
            target.getJsDocTags(checker).find((t) => t.name === "deprecated")?.text,
          )
        : undefined,
      beta: tags.includes("beta"),
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "en"));
  return {
    exports: out,
    reachable: [...reachable.entries()]
      .map(([name, declaration]) => ({ name, declaration }))
      .sort((a, b) => a.name.localeCompare(b.name, "en")),
  };
}

/** Entry points of the package: export path in package.json → source file. */
export const ENTRY_POINTS: Record<string, string> = {
  ".": "src/index.ts",
  "./xpath": "src/xpath.ts",
  "./rules-check": "src/rules-check.ts",
  "./cli": "src/cli.ts",
};
