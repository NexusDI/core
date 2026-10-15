import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

/**
 * The NEXUS_ names the packages export as values from src/index.ts, such as
 * @nexusdi/react-router's NEXUS_SCOPE. A README may name these; any other
 * NEXUS_ word reads as an error code.
 */
export function publicConstants(root: string): Set<string> {
  const found = new Set<string>();
  const libs = join(root, 'libs');
  if (!existsSync(libs)) return found;
  for (const name of readdirSync(libs)) {
    const path = join(libs, name, 'src', 'index.ts');
    if (!existsSync(path)) continue;
    const source = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const add = (word: string) => {
      if (word.startsWith('NEXUS_')) found.add(word);
    };
    for (const statement of source.statements) {
      const exported = ts.canHaveModifiers(statement)
        ? ts
            .getModifiers(statement)
            ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        : false;
      if (ts.isVariableStatement(statement) && exported)
        for (const declaration of statement.declarationList.declarations)
          if (ts.isIdentifier(declaration.name)) add(declaration.name.text);
      if (
        (ts.isFunctionDeclaration(statement) ||
          ts.isClassDeclaration(statement)) &&
        exported &&
        statement.name !== undefined
      )
        add(statement.name.text);
      if (
        ts.isExportDeclaration(statement) &&
        !statement.isTypeOnly &&
        statement.exportClause !== undefined &&
        ts.isNamedExports(statement.exportClause)
      )
        for (const element of statement.exportClause.elements)
          if (!element.isTypeOnly) add(element.name.text);
    }
  }
  return found;
}
