/**
 * Code refactoring engine with automated transformations.
 * Provides extract, inline, rename, conversion, and import management
 * refactorings with language-aware applicability checks.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TextSelection {
  start: number;
  end: number;
}

export interface LineRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface TextEdit {
  range: LineRange;
  newText: string;
}

export type RefactoringLanguage =
  | 'typescript'
  | 'javascript'
  | 'typescriptreact'
  | 'javascriptreact';

export interface RefactoringContext {
  sourceText: string;
  selection: TextSelection;
  language: RefactoringLanguage;
  filePath?: string;
}

export interface RefactoringResult {
  edits: TextEdit[];
  /** Optional cursor position after refactoring */
  cursorOffset?: number;
  /** Optional new file to create (for extract component) */
  newFile?: { path: string; content: string };
}

export interface Refactoring {
  id: string;
  label: string;
  description: string;
  supportedLanguages: RefactoringLanguage[];
  canApply(ctx: RefactoringContext): boolean;
  apply(ctx: RefactoringContext): RefactoringResult;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const JS_LANGUAGES: RefactoringLanguage[] = [
  'typescript', 'javascript', 'typescriptreact', 'javascriptreact',
];

const TS_ONLY: RefactoringLanguage[] = ['typescript', 'typescriptreact'];

const JSX_LANGUAGES: RefactoringLanguage[] = ['typescriptreact', 'javascriptreact'];

function isLanguageSupported(lang: RefactoringLanguage, supported: RefactoringLanguage[]): boolean {
  return supported.includes(lang);
}

function getSelectedText(source: string, sel: TextSelection): string {
  return source.slice(sel.start, sel.end);
}

function extractIdentifiers(snippet: string): string[] {
  const cleaned = snippet
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(["'`])(?:(?!\1|\\).|\\.)*\1/g, '');

  const matches = cleaned.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g) || [];
  const keywords = new Set([
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
    'do', 'switch', 'case', 'break', 'continue', 'new', 'delete', 'typeof',
    'instanceof', 'void', 'this', 'class', 'extends', 'super', 'import',
    'export', 'default', 'from', 'as', 'try', 'catch', 'finally', 'throw',
    'async', 'await', 'yield', 'in', 'of', 'true', 'false', 'null', 'undefined',
    'interface', 'type', 'enum', 'implements', 'public', 'private', 'protected',
    'static', 'readonly', 'abstract', 'declare', 'module', 'namespace',
  ]);
  return [...new Set(matches)].filter((id) => !keywords.has(id));
}

function findDeclaredIdentifiers(snippet: string): Set<string> {
  const declared = new Set<string>();
  const declRegex = /\b(?:const|let|var)\s+(?:\{([^}]*)\}|([a-zA-Z_$][a-zA-Z0-9_$]*))/g;
  let m: RegExpExecArray | null;
  while ((m = declRegex.exec(snippet)) !== null) {
    if (m[1]) {
      m[1].split(',').forEach((part) => {
        const id = part.split(':')[0].trim();
        if (id) declared.add(id);
      });
    } else if (m[2]) {
      declared.add(m[2]);
    }
  }
  const fnRegex = /\bfunction\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  while ((m = fnRegex.exec(snippet)) !== null) {
    declared.add(m[1]);
  }
  return declared;
}

function getIndentAtOffset(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
  const match = source.slice(lineStart).match(/^(\s*)/);
  return match ? match[1] : '';
}

function looksLikeExpression(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.includes(';') || trimmed.includes('\n')) return false;
  if (/^(if|for|while|switch|return|const|let|var|function|class)\b/.test(trimmed)) return false;
  return true;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isInsideStringOrComment(source: string, pos: number): boolean {
  let sng = false, dbl = false, tpl = false, lc = false, bc = false;
  for (let i = 0; i < pos; i++) {
    const ch = source[i], nx = source[i + 1];
    if (lc) { if (ch === '\n') lc = false; continue; }
    if (bc) { if (ch === '*' && nx === '/') { bc = false; i++; } continue; }
    if (sng) { if (ch === '\\') i++; else if (ch === "'") sng = false; continue; }
    if (dbl) { if (ch === '\\') i++; else if (ch === '"') dbl = false; continue; }
    if (tpl) { if (ch === '\\') i++; else if (ch === '`') tpl = false; continue; }
    if (ch === '/' && nx === '/') { lc = true; i++; }
    else if (ch === '/' && nx === '*') { bc = true; i++; }
    else if (ch === "'") sng = true;
    else if (ch === '"') dbl = true;
    else if (ch === '`') tpl = true;
  }
  return sng || dbl || tpl || lc || bc;
}

function offsetToLineCol(source: string, offset: number): { line: number; col: number } {
  let line = 1, col = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') { line++; col = 1; } else { col++; }
  }
  return { line, col };
}

function makeEdit(source: string, sel: TextSelection, newText: string): TextEdit {
  const s = offsetToLineCol(source, sel.start), e = offsetToLineCol(source, sel.end);
  return { range: { startLine: s.line, startColumn: s.col, endLine: e.line, endColumn: e.col }, newText };
}

function singleEdit(source: string, sel: TextSelection, newText: string): RefactoringResult {
  return { edits: [makeEdit(source, sel, newText)] };
}

function fullFileEdit(source: string, newSource: string, cursorOffset?: number): RefactoringResult {
  return { edits: [makeEdit(source, { start: 0, end: source.length }, newSource)], cursorOffset };
}

function isTypeScriptLanguage(lang: RefactoringLanguage): boolean {
  return lang === 'typescript' || lang === 'typescriptreact';
}

// ─── 1. Extract Variable ─────────────────────────────────────────────────────

const extractVariable: Refactoring = {
  id: 'extract-variable',
  label: 'Extract Variable',
  description: 'Extract selected expression into a const/let variable above',
  supportedLanguages: JS_LANGUAGES,

  canApply(ctx) {
    if (!isLanguageSupported(ctx.language, this.supportedLanguages)) return false;
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();
    return text.length > 0 && looksLikeExpression(text);
  },

  apply(ctx) {
    const expr = getSelectedText(ctx.sourceText, ctx.selection).trim();
    const indent = getIndentAtOffset(ctx.sourceText, ctx.selection.start);
    const varName = 'extracted';
    const declaration = `${indent}const ${varName} = ${expr};\n`;
    const lineStart = ctx.sourceText.lastIndexOf('\n', ctx.selection.start - 1) + 1;

    const newSource =
      ctx.sourceText.slice(0, lineStart) +
      declaration +
      ctx.sourceText.slice(lineStart, ctx.selection.start) +
      varName +
      ctx.sourceText.slice(ctx.selection.end);

    return fullFileEdit(ctx.sourceText, newSource, lineStart + indent.length + 6);
  },
};

// ─── 2. Extract Function ─────────────────────────────────────────────────────

const extractFunction: Refactoring = {
  id: 'extract-function',
  label: 'Extract Function',
  description: 'Extract selected block into a new function, auto-detecting parameters',
  supportedLanguages: JS_LANGUAGES,

  canApply(ctx) {
    if (!isLanguageSupported(ctx.language, this.supportedLanguages)) return false;
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();
    return text.length > 0 && (text.includes('\n') || text.length > 20);
  },

  apply(ctx) {
    const selected = getSelectedText(ctx.sourceText, ctx.selection);
    const trimmed = selected.trim();
    const indent = getIndentAtOffset(ctx.sourceText, ctx.selection.start);

    const allIds = extractIdentifiers(trimmed);
    const declaredInside = findDeclaredIdentifiers(trimmed);
    const beforeSelection = ctx.sourceText.slice(0, ctx.selection.start);
    const declaredBefore = findDeclaredIdentifiers(beforeSelection);

    const params = allIds.filter((id) => !declaredInside.has(id) && declaredBefore.has(id));

    const afterSelection = ctx.sourceText.slice(ctx.selection.end);
    const usedAfter = extractIdentifiers(afterSelection);
    const returnVars = [...declaredInside].filter((id) => usedAfter.includes(id));

    const funcName = 'extractedFunction';
    const paramList = params.join(', ');

    let returnStatement = '';
    if (returnVars.length === 1) {
      returnStatement = `\n${indent}  return ${returnVars[0]};`;
    } else if (returnVars.length > 1) {
      returnStatement = `\n${indent}  return { ${returnVars.join(', ')} };`;
    }

    const bodyLines = trimmed.split('\n').map((line) => `${indent}  ${line.trimStart()}`);
    const funcBody = bodyLines.join('\n');

    const funcDecl = [
      `${indent}function ${funcName}(${paramList}) {`,
      funcBody,
      returnStatement,
      `${indent}}`,
    ].filter(Boolean).join('\n');

    let callSite: string;
    if (returnVars.length === 0) {
      callSite = `${indent}${funcName}(${paramList});`;
    } else if (returnVars.length === 1) {
      callSite = `${indent}const ${returnVars[0]} = ${funcName}(${paramList});`;
    } else {
      callSite = `${indent}const { ${returnVars.join(', ')} } = ${funcName}(${paramList});`;
    }

    const newSource =
      ctx.sourceText.slice(0, ctx.selection.start) +
      callSite + '\n\n' + funcDecl +
      ctx.sourceText.slice(ctx.selection.end);

    return fullFileEdit(ctx.sourceText, newSource);
  },
};

// ─── 3. Extract Component (React) ────────────────────────────────────────────

const extractComponent: Refactoring = {
  id: 'extract-component',
  label: 'Extract React Component',
  description: 'Extract selected JSX into a new React component',
  supportedLanguages: JSX_LANGUAGES,

  canApply(ctx) {
    if (!isLanguageSupported(ctx.language, this.supportedLanguages)) return false;
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();
    return text.startsWith('<') && text.length > 5;
  },

  apply(ctx) {
    const jsxSnippet = getSelectedText(ctx.sourceText, ctx.selection).trim();
    const indent = getIndentAtOffset(ctx.sourceText, ctx.selection.start);

    // Detect props: identifiers referenced that are from the enclosing scope
    const allIds = extractIdentifiers(jsxSnippet);
    const beforeSel = ctx.sourceText.slice(0, ctx.selection.start);
    const declaredBefore = findDeclaredIdentifiers(beforeSel);
    const props = allIds.filter((id) => declaredBefore.has(id));

    const componentName = 'ExtractedComponent';
    const isTS = isTypeScriptLanguage(ctx.language);

    let propsInterface = '';
    let propsParam = '';
    let propsSpread = '';

    if (props.length > 0) {
      if (isTS) {
        const propsType = props.map((p) => `  ${p}: typeof ${p};`).join('\n');
        propsInterface = `interface ${componentName}Props {\n${propsType}\n}\n\n`;
        propsParam = `{ ${props.join(', ')} }: ${componentName}Props`;
      } else {
        propsParam = `{ ${props.join(', ')} }`;
      }
      propsSpread = ' ' + props.map((p) => `${p}={${p}}`).join(' ');
    }

    const componentDef = [
      propsInterface,
      `function ${componentName}(${propsParam}) {`,
      `  return (`,
      `    ${jsxSnippet}`,
      `  );`,
      `}`,
    ].filter(Boolean).join('\n');

    const callSite = `${indent}<${componentName}${propsSpread} />`;

    // Place the component definition above the function containing the selection
    const funcStart = beforeSel.lastIndexOf('\nfunction ');
    const constFunc = beforeSel.lastIndexOf('\nconst ');
    const insertionPoint = Math.max(funcStart, constFunc, 0);

    const newSource =
      ctx.sourceText.slice(0, insertionPoint) +
      '\n' + componentDef + '\n' +
      ctx.sourceText.slice(insertionPoint, ctx.selection.start) +
      callSite +
      ctx.sourceText.slice(ctx.selection.end);

    return fullFileEdit(ctx.sourceText, newSource);
  },
};

// ─── 4. Inline Variable ─────────────────────────────────────────────────────

const inlineVariable: Refactoring = {
  id: 'inline-variable',
  label: 'Inline Variable',
  description: 'Replace all usages of a variable with its initializer value',
  supportedLanguages: JS_LANGUAGES,

  canApply(ctx) {
    if (!isLanguageSupported(ctx.language, this.supportedLanguages)) return false;
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(text)) return false;
    const declPattern = new RegExp(`(?:const|let|var)\\s+${escapeRegex(text)}\\s*=\\s*`);
    return declPattern.test(ctx.sourceText);
  },

  apply(ctx) {
    const varName = getSelectedText(ctx.sourceText, ctx.selection).trim();
    const declRegex = new RegExp(
      `([ \\t]*)(?:const|let|var)\\s+${escapeRegex(varName)}\\s*=\\s*(.+?)\\s*;[ \\t]*\\r?\\n?`
    );
    const declMatch = ctx.sourceText.match(declRegex);
    if (!declMatch) return { edits: [] };

    const initializer = declMatch[2];
    let result = ctx.sourceText.replace(declRegex, '');
    const usageRegex = new RegExp(`\\b${escapeRegex(varName)}\\b`, 'g');
    result = result.replace(usageRegex, (match, offset: number) => {
      if (isInsideStringOrComment(result, offset)) return match;
      return initializer;
    });

    return fullFileEdit(ctx.sourceText, result);
  },
};

// ─── 5. Rename Symbol ────────────────────────────────────────────────────────

const renameSymbol: Refactoring = {
  id: 'rename-symbol',
  label: 'Rename Symbol',
  description: 'Rename all occurrences of the selected identifier within file scope',
  supportedLanguages: JS_LANGUAGES,

  canApply(ctx) {
    if (!isLanguageSupported(ctx.language, this.supportedLanguages)) return false;
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(text);
  },

  apply(ctx) {
    const oldName = getSelectedText(ctx.sourceText, ctx.selection).trim();
    const newName = `${oldName}Renamed`;
    const wordBoundary = new RegExp(`\\b${escapeRegex(oldName)}\\b`, 'g');

    let result = '';
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = wordBoundary.exec(ctx.sourceText)) !== null) {
      const pos = match.index;
      if (!isInsideStringOrComment(ctx.sourceText, pos)) {
        result += ctx.sourceText.slice(lastIndex, pos) + newName;
      } else {
        result += ctx.sourceText.slice(lastIndex, pos) + oldName;
      }
      lastIndex = pos + oldName.length;
    }
    result += ctx.sourceText.slice(lastIndex);

    return fullFileEdit(ctx.sourceText, result);
  },
};

// ─── 6. Convert Function <-> Arrow Function ─────────────────────────────────

const convertFunctionArrow: Refactoring = {
  id: 'convert-function-arrow',
  label: 'Convert Function / Arrow',
  description: 'Convert between arrow function and regular function declaration',
  supportedLanguages: JS_LANGUAGES,

  canApply(ctx) {
    if (!isLanguageSupported(ctx.language, this.supportedLanguages)) return false;
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();
    const isArrow = /=>/.test(text) && /(?:const|let|var)\s+\w+\s*=/.test(text);
    const isRegular = /^(?:async\s+)?function\s+\w+/.test(text);
    return isArrow || isRegular;
  },

  apply(ctx) {
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();

    // Arrow -> Regular
    const arrowMatch = text.match(
      /^((?:export\s+)?)(const|let|var)\s+(\w+)\s*=\s*(async\s+)?(?:\(([^)]*)\)|(\w+))\s*=>\s*([\s\S]*)$/
    );
    if (arrowMatch) {
      const [, exportKw, , name, asyncKw, params, singleParam, body] = arrowMatch;
      const paramList = params ?? singleParam ?? '';
      const asyncPrefix = asyncKw ? 'async ' : '';
      let funcBody: string;
      const trimBody = body.trim();
      if (trimBody.startsWith('{')) {
        funcBody = trimBody;
      } else {
        const cleaned = trimBody.replace(/;$/, '');
        funcBody = `{\n  return ${cleaned};\n}`;
      }
      const result = `${exportKw}${asyncPrefix}function ${name}(${paramList}) ${funcBody}`;
      return singleEdit(ctx.sourceText, ctx.selection, result);
    }

    // Regular -> Arrow
    const funcMatch = text.match(
      /^((?:export\s+)?)(async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*(\{[\s\S]*\})$/
    );
    if (funcMatch) {
      const [, exportKw, asyncKw, name, params, body] = funcMatch;
      const asyncPrefix = asyncKw ? 'async ' : '';
      const result = `${exportKw}const ${name} = ${asyncPrefix}(${params}) => ${body}`;
      return singleEdit(ctx.sourceText, ctx.selection, result);
    }

    return { edits: [] };
  },
};

// ─── 7. Convert String to Template Literal ──────────────────────────────────

const convertStringTemplate: Refactoring = {
  id: 'convert-string-template',
  label: 'Convert String / Template Literal',
  description: 'Toggle between string quotes and template literal',
  supportedLanguages: JS_LANGUAGES,

  canApply(ctx) {
    if (!isLanguageSupported(ctx.language, this.supportedLanguages)) return false;
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();
    return /^(['"`])[\s\S]*\1$/.test(text);
  },

  apply(ctx) {
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();
    const quote = text[0];
    const inner = text.slice(1, -1);

    let result: string;
    if (quote === "'") {
      const escaped = inner.replace(/\\'/g, "'").replace(/(?<!\\)"/g, '\\"');
      result = `"${escaped}"`;
    } else if (quote === '"') {
      const unescaped = inner.replace(/\\"/g, '"');
      result = `\`${unescaped}\``;
    } else {
      const escaped = inner.replace(/(?<!\\)'/g, "\\'");
      result = `'${escaped}'`;
    }

    return singleEdit(ctx.sourceText, ctx.selection, result);
  },
};

// ─── 8. Convert If/Else <-> Ternary ─────────────────────────────────────────

const convertTernary: Refactoring = {
  id: 'convert-ternary',
  label: 'Convert If/Else / Ternary',
  description: 'Convert between if-else statement and ternary expression',
  supportedLanguages: JS_LANGUAGES,

  canApply(ctx) {
    if (!isLanguageSupported(ctx.language, this.supportedLanguages)) return false;
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();
    const isIfElse = /^if\s*\(/.test(text) && /\belse\b/.test(text);
    const isTernary = /\?[\s\S]+:/.test(text) && !/^if\s*\(/.test(text);
    return isIfElse || isTernary;
  },

  apply(ctx) {
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();
    const indent = getIndentAtOffset(ctx.sourceText, ctx.selection.start);

    // If-else -> ternary
    const ifElseMatch = text.match(
      /^if\s*\((.+?)\)\s*\{\s*(?:return\s+)?(.+?)\s*;?\s*\}\s*else\s*\{\s*(?:return\s+)?(.+?)\s*;?\s*\}$/s
    );
    if (ifElseMatch) {
      const [, condition, consequent, alternate] = ifElseMatch;
      const hasReturn = /return\s/.test(text);
      const ternary = `${condition.trim()} ? ${consequent.trim()} : ${alternate.trim()}`;
      const result = hasReturn
        ? `${indent}return ${ternary};`
        : `${indent}${ternary};`;
      return singleEdit(ctx.sourceText, ctx.selection, result);
    }

    // Ternary -> if-else
    const ternaryMatch = text.match(
      /^(?:(return)\s+)?(.+?)\s*\?\s*(.+?)\s*:\s*(.+?)\s*;?\s*$/s
    );
    if (ternaryMatch) {
      const [, returnKw, condition, consequent, alternate] = ternaryMatch;
      const retPrefix = returnKw ? 'return ' : '';
      const ifElse = [
        `${indent}if (${condition.trim()}) {`,
        `${indent}  ${retPrefix}${consequent.trim()};`,
        `${indent}} else {`,
        `${indent}  ${retPrefix}${alternate.trim()};`,
        `${indent}}`,
      ].join('\n');
      return singleEdit(ctx.sourceText, ctx.selection, ifElse);
    }

    return { edits: [] };
  },
};

// ─── 9. Convert For Loop to .map/.filter/.forEach ───────────────────────────

const convertForToArrayMethod: Refactoring = {
  id: 'convert-for-to-array-method',
  label: 'Convert For Loop to Array Method',
  description: 'Convert for loop to .map(), .filter(), or .forEach()',
  supportedLanguages: JS_LANGUAGES,

  canApply(ctx) {
    if (!isLanguageSupported(ctx.language, this.supportedLanguages)) return false;
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();
    // Match for...of or traditional for with array indexing
    return /^for\s*\(/.test(text);
  },

  apply(ctx) {
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();
    const indent = getIndentAtOffset(ctx.sourceText, ctx.selection.start);

    // for (const item of array) { body }
    const forOfMatch = text.match(/^for\s*\(\s*(?:const|let|var)\s+(\w+)\s+of\s+(\w+)\s*\)\s*\{([\s\S]*)\}$/);
    if (forOfMatch) {
      const [, itemVar, arrayVar, body] = forOfMatch;
      const trimBody = body.trim();
      // Detect push pattern -> .map()
      const pushMatch = trimBody.match(/^(\w+)\.push\((.+)\);?$/s);
      if (pushMatch) {
        const result = `${indent}const ${pushMatch[1]} = ${arrayVar}.map((${itemVar}) => ${pushMatch[2].trim()});`;
        return singleEdit(ctx.sourceText, ctx.selection, result);
      }
      // Detect if+push pattern -> .filter()
      const filterMatch = trimBody.match(/^if\s*\((.+?)\)\s*\{\s*(\w+)\.push\(\s*(\w+)\s*\)\s*;?\s*\}$/s);
      if (filterMatch && filterMatch[3] === itemVar) {
        const result = `${indent}const ${filterMatch[2]} = ${arrayVar}.filter((${itemVar}) => ${filterMatch[1].trim()});`;
        return singleEdit(ctx.sourceText, ctx.selection, result);
      }
      // Default: .forEach()
      const bodyLines = trimBody.split('\n').map((l) => `${indent}  ${l.trimStart()}`).join('\n');
      return singleEdit(ctx.sourceText, ctx.selection, `${indent}${arrayVar}.forEach((${itemVar}) => {\n${bodyLines}\n${indent}});`);
    }

    // Traditional for (let i = 0; i < arr.length; i++)
    const tradMatch = text.match(/^for\s*\(\s*let\s+(\w+)\s*=\s*0\s*;\s*\1\s*<\s*(\w+)\.length\s*;\s*\1\+\+\s*\)\s*\{([\s\S]*)\}$/);
    if (tradMatch) {
      const [, indexVar, arrayVar, body] = tradMatch;
      const replaced = body.replace(new RegExp(`${escapeRegex(arrayVar)}\\[${escapeRegex(indexVar)}\\]`, 'g'), 'item').trim();
      const bodyLines = replaced.split('\n').map((l) => `${indent}  ${l.trimStart()}`).join('\n');
      return singleEdit(ctx.sourceText, ctx.selection, `${indent}${arrayVar}.forEach((item) => {\n${bodyLines}\n${indent}});`);
    }
    return { edits: [] };
  },
};

// ─── 10. Convert Promise .then() to async/await ────────────────────────────

const convertPromiseToAsyncAwait: Refactoring = {
  id: 'convert-promise-to-async-await',
  label: 'Convert .then() to async/await',
  description: 'Convert promise .then() chain to async/await syntax',
  supportedLanguages: JS_LANGUAGES,

  canApply(ctx) {
    if (!isLanguageSupported(ctx.language, this.supportedLanguages)) return false;
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();
    return /\.then\s*\(/.test(text);
  },

  apply(ctx) {
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();
    const indent = getIndentAtOffset(ctx.sourceText, ctx.selection.start);

    const parts: { param: string; body: string }[] = [];
    let baseExpr = '';
    const baseMatch = text.match(/^([\s\S]+?)\.then\s*\(/);
    if (baseMatch) baseExpr = baseMatch[1].trim();

    const thenRegex = /\.then\s*\(\s*(?:\(?\s*(\w+)\s*\)?\s*=>|function\s*\(\s*(\w+)\s*\))\s*(?:\{([\s\S]*?)\}|([\s\S]*?))\s*\)/g;
    let thenMatch: RegExpExecArray | null;
    while ((thenMatch = thenRegex.exec(text)) !== null) {
      parts.push({ param: thenMatch[1] || thenMatch[2] || 'result', body: (thenMatch[3] || thenMatch[4] || '').trim() });
    }

    let catchParam = '', catchBody = '';
    const catchMatch = text.match(/\.catch\s*\(\s*(?:\(?\s*(\w+)\s*\)?\s*=>|function\s*\(\s*(\w+)\s*\))\s*(?:\{([\s\S]*?)\}|([\s\S]*?))\s*\)/);
    if (catchMatch) {
      catchParam = catchMatch[1] || catchMatch[2] || 'error';
      catchBody = (catchMatch[3] || catchMatch[4] || '').trim();
    }

    if (parts.length === 0) return { edits: [] };

    // Build async/await version
    const lines: string[] = [];
    if (catchMatch) {
      lines.push(`${indent}try {`);
    }

    const innerIndent = catchMatch ? `${indent}  ` : indent;

    // First await
    lines.push(`${innerIndent}const ${parts[0].param} = await ${baseExpr};`);
    if (parts[0].body) {
      const bodyText = parts[0].body.replace(/^return\s+/, '').replace(/;$/, '');
      if (bodyText !== parts[0].param) {
        lines.push(`${innerIndent}${parts[0].body};`);
      }
    }

    // Subsequent .then() calls
    for (let i = 1; i < parts.length; i++) {
      const prevBody = parts[i - 1].body.replace(/^return\s+/, '').replace(/;$/, '').trim();
      const awaitExpr = prevBody || parts[i - 1].param;
      lines.push(`${innerIndent}const ${parts[i].param} = await ${awaitExpr};`);
      if (parts[i].body) {
        lines.push(`${innerIndent}${parts[i].body};`);
      }
    }

    if (catchMatch) {
      lines.push(`${indent}} catch (${catchParam}) {`);
      if (catchBody) {
        const catchLines = catchBody.split('\n').map((l) => `${indent}  ${l.trimStart()}`);
        lines.push(...catchLines);
      }
      lines.push(`${indent}}`);
    }

    const result = lines.join('\n');
    return singleEdit(ctx.sourceText, ctx.selection, result);
  },
};

// ─── 11. Add/Remove Async ───────────────────────────────────────────────────

const toggleAsync: Refactoring = {
  id: 'toggle-async',
  label: 'Toggle Async',
  description: 'Add or remove async modifier from a function',
  supportedLanguages: JS_LANGUAGES,

  canApply(ctx) {
    if (!isLanguageSupported(ctx.language, this.supportedLanguages)) return false;
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();
    return /\bfunction\b/.test(text) || /=>/.test(text);
  },

  apply(ctx) {
    let text = getSelectedText(ctx.sourceText, ctx.selection);

    if (/\basync\b/.test(text)) {
      text = text.replace(/\basync\s+/, '');
      text = text.replace(/\bawait\s+/g, '');
    } else {
      if (/\bfunction\b/.test(text)) {
        text = text.replace(/\bfunction\b/, 'async function');
      } else {
        text = text.replace(
          /^(\s*(?:(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*)?)(\(|[a-zA-Z_$])/,
          '$1async $2'
        );
      }
    }

    return singleEdit(ctx.sourceText, ctx.selection, text);
  },
};

// ─── 12. Wrap in Try-Catch ──────────────────────────────────────────────────

const wrapInTryCatch: Refactoring = {
  id: 'wrap-try-catch',
  label: 'Wrap in Try-Catch',
  description: 'Wrap selected code in a try-catch block',
  supportedLanguages: JS_LANGUAGES,

  canApply(ctx) {
    if (!isLanguageSupported(ctx.language, this.supportedLanguages)) return false;
    return getSelectedText(ctx.sourceText, ctx.selection).trim().length > 0;
  },

  apply(ctx) {
    const selected = getSelectedText(ctx.sourceText, ctx.selection);
    const indent = getIndentAtOffset(ctx.sourceText, ctx.selection.start);
    const innerIndent = indent + '  ';

    const indentedBody = selected
      .split('\n')
      .map((line) => (line.trim() ? `${innerIndent}${line.trimStart()}` : line))
      .join('\n');

    const tryCatch = [
      `${indent}try {`,
      indentedBody,
      `${indent}} catch (error) {`,
      `${innerIndent}console.error(error);`,
      `${indent}}`,
    ].join('\n');

    return singleEdit(ctx.sourceText, ctx.selection, tryCatch);
  },
};

// ─── 13. Wrap in If Condition ───────────────────────────────────────────────

const wrapInIfCondition: Refactoring = {
  id: 'wrap-in-if',
  label: 'Wrap in If Condition',
  description: 'Wrap selected code inside an if statement',
  supportedLanguages: JS_LANGUAGES,

  canApply(ctx) {
    if (!isLanguageSupported(ctx.language, this.supportedLanguages)) return false;
    return getSelectedText(ctx.sourceText, ctx.selection).trim().length > 0;
  },

  apply(ctx) {
    const selected = getSelectedText(ctx.sourceText, ctx.selection);
    const indent = getIndentAtOffset(ctx.sourceText, ctx.selection.start);
    const innerIndent = indent + '  ';

    const indentedBody = selected
      .split('\n')
      .map((line) => (line.trim() ? `${innerIndent}${line.trimStart()}` : line))
      .join('\n');

    const wrapped = [
      `${indent}if (condition) {`,
      indentedBody,
      `${indent}}`,
    ].join('\n');

    const cursorPos = ctx.selection.start + indent.length + 4; // position at "condition"
    return {
      edits: [makeEdit(ctx.sourceText, ctx.selection, wrapped)],
      cursorOffset: cursorPos,
    };
  },
};

// ─── 14. Toggle Optional Chaining (?.) ──────────────────────────────────────

const toggleOptionalChaining: Refactoring = {
  id: 'toggle-optional-chaining',
  label: 'Toggle Optional Chaining',
  description: 'Add or remove optional chaining (?.) on property access',
  supportedLanguages: JS_LANGUAGES,

  canApply(ctx) {
    if (!isLanguageSupported(ctx.language, this.supportedLanguages)) return false;
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();
    // Must contain property access: a.b or a?.b
    return /[a-zA-Z_$]\s*\??\.\s*[a-zA-Z_$]/.test(text);
  },

  apply(ctx) {
    const text = getSelectedText(ctx.sourceText, ctx.selection);
    let result: string;

    if (text.includes('?.')) {
      // Remove optional chaining: a?.b -> a.b, a?.() -> a(), a?.[x] -> a[x]
      result = text.replace(/\?\./g, '.').replace(/\?\(/g, '(').replace(/\?\[/g, '[');
    } else {
      // Add optional chaining: a.b -> a?.b (skip method calls like a.b())
      result = text.replace(/(\w)\./g, '$1?.');
    }

    return singleEdit(ctx.sourceText, ctx.selection, result);
  },
};

// ─── 15. Toggle Nullish Coalescing (??) ─────────────────────────────────────

const toggleNullishCoalescing: Refactoring = {
  id: 'toggle-nullish-coalescing',
  label: 'Toggle Nullish Coalescing',
  description: 'Toggle between ?? and || operators',
  supportedLanguages: JS_LANGUAGES,

  canApply(ctx) {
    if (!isLanguageSupported(ctx.language, this.supportedLanguages)) return false;
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();
    return /\?\?/.test(text) || /\|\|/.test(text);
  },

  apply(ctx) {
    const text = getSelectedText(ctx.sourceText, ctx.selection);
    let result: string;

    if (text.includes('??')) {
      result = text.replace(/\?\?/g, '||');
    } else {
      result = text.replace(/\|\|/g, '??');
    }

    return singleEdit(ctx.sourceText, ctx.selection, result);
  },
};

// ─── 16. Sort Imports ───────────────────────────────────────────────────────

interface ParsedImport {
  original: string;
  source: string;
  defaultImport: string | null;
  namedImports: string[];
  namespaceImport: string | null;
  isTypeOnly: boolean;
  sideEffectOnly: boolean;
}

function parseImportLine(line: string): ParsedImport | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('import')) return null;
  const isTypeOnly = /^import\s+type\b/.test(trimmed);

  const sideEffectMatch = trimmed.match(/^import\s+(['"])(.+?)\1\s*;?\s*$/);
  if (sideEffectMatch) {
    return { original: trimmed, source: sideEffectMatch[2], defaultImport: null,
      namedImports: [], namespaceImport: null, isTypeOnly: false, sideEffectOnly: true };
  }

  const sourceMatch = trimmed.match(/from\s+(['"])(.+?)\1/);
  if (!sourceMatch) return null;
  const source = sourceMatch[2];
  let defaultImport: string | null = null;
  let namedImports: string[] = [];
  let namespaceImport: string | null = null;

  const importClause = trimmed.replace(/^import\s+(type\s+)?/, '')
    .replace(/\s*from\s+['"].*['"];?\s*$/, '').trim();

  const nsMatch = importClause.match(/^\*\s+as\s+(\w+)$/);
  if (nsMatch) {
    namespaceImport = nsMatch[1];
  } else {
    const bracesMatch = importClause.match(/\{([^}]*)\}/);
    if (bracesMatch) {
      namedImports = bracesMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    }
    const defaultMatch = importClause.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\s*,)?/);
    if (defaultMatch && defaultMatch[1] !== '*' && (!bracesMatch || !importClause.startsWith('{'))) {
      defaultImport = defaultMatch[1];
    }
  }

  return { original: trimmed, source, defaultImport, namedImports,
    namespaceImport, isTypeOnly, sideEffectOnly: false };
}

function classifyImportSource(source: string): 'builtin' | 'external' | 'internal' | 'relative' {
  if (source.startsWith('.')) return 'relative';
  if (source.startsWith('@/') || source.startsWith('~/')) return 'internal';
  const builtins = new Set(['fs','path','os','http','https','url','util','events','stream',
    'crypto','buffer','child_process','cluster','net','tls','readline','vm','zlib','assert']);
  const base = source.split('/')[0];
  if (builtins.has(base) || source.startsWith('node:')) return 'builtin';
  return 'external';
}

function reconstructImport(parsed: ParsedImport): string {
  if (parsed.sideEffectOnly) return `import '${parsed.source}';`;
  const typePrefix = parsed.isTypeOnly ? 'type ' : '';
  const parts: string[] = [];
  if (parsed.defaultImport) parts.push(parsed.defaultImport);
  if (parsed.namespaceImport) parts.push(`* as ${parsed.namespaceImport}`);
  if (parsed.namedImports.length > 0) parts.push(`{ ${parsed.namedImports.join(', ')} }`);
  return `import ${typePrefix}${parts.join(', ')} from '${parsed.source}';`;
}

export function organizeImports(code: string): string {
  const lines = code.split('\n');
  let importStart = -1, importEnd = -1;
  const parsedImports: ParsedImport[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('import ')) {
      if (importStart === -1) importStart = i;
      importEnd = i;
      const parsed = parseImportLine(trimmed);
      if (parsed) parsedImports.push(parsed);
    } else if (importStart !== -1 && trimmed !== '' && !trimmed.startsWith('//')) break;
  }
  if (parsedImports.length === 0) return code;

  const mergedMap = new Map<string, ParsedImport>();
  for (const imp of parsedImports) {
    const key = `${imp.isTypeOnly ? 'type:' : ''}${imp.source}`;
    const existing = mergedMap.get(key);
    if (existing && !imp.sideEffectOnly) {
      if (imp.defaultImport && !existing.defaultImport) existing.defaultImport = imp.defaultImport;
      if (imp.namespaceImport && !existing.namespaceImport) existing.namespaceImport = imp.namespaceImport;
      existing.namedImports = [...new Set([...existing.namedImports, ...imp.namedImports])].sort();
    } else mergedMap.set(key, { ...imp, namedImports: [...imp.namedImports] });
  }

  const groups: Record<string, ParsedImport[]> = { builtin: [], external: [], internal: [], relative: [] };
  for (const imp of mergedMap.values()) groups[classifyImportSource(imp.source)].push(imp);
  for (const key of Object.keys(groups)) groups[key].sort((a, b) => a.source.localeCompare(b.source));

  const importLines: string[] = [];
  let addedGroup = false;
  for (const groupKey of ['builtin', 'external', 'internal', 'relative']) {
    if (groups[groupKey].length === 0) continue;
    if (addedGroup) importLines.push('');
    for (const imp of groups[groupKey]) importLines.push(reconstructImport(imp));
    addedGroup = true;
  }

  return [...lines.slice(0, importStart), ...importLines, ...lines.slice(importEnd + 1)].join('\n');
}

const sortImports: Refactoring = {
  id: 'sort-imports',
  label: 'Sort Imports',
  description: 'Sort and group imports by type: external, internal, relative',
  supportedLanguages: JS_LANGUAGES,

  canApply(ctx) {
    if (!isLanguageSupported(ctx.language, this.supportedLanguages)) return false;
    return /^import\s/m.test(ctx.sourceText);
  },

  apply(ctx) {
    return fullFileEdit(ctx.sourceText, organizeImports(ctx.sourceText));
  },
};

// ─── 17. Remove Unused Imports ──────────────────────────────────────────────

const removeUnusedImports: Refactoring = {
  id: 'remove-unused-imports',
  label: 'Remove Unused Imports',
  description: 'Remove import specifiers that are not referenced in the file body',
  supportedLanguages: JS_LANGUAGES,

  canApply(ctx) {
    if (!isLanguageSupported(ctx.language, this.supportedLanguages)) return false;
    return /^import\s/m.test(ctx.sourceText);
  },

  apply(ctx) {
    const lines = ctx.sourceText.split('\n');
    const importLines: number[] = [];
    let lastImportLine = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('import ')) {
        importLines.push(i);
        lastImportLine = i;
      }
    }

    if (importLines.length === 0) return { edits: [] };

    // Get the code body after imports
    const bodyText = lines.slice(lastImportLine + 1).join('\n');
    const bodyIdentifiers = new Set(extractIdentifiers(bodyText));

    const resultLines = [...lines];
    const linesToRemove: number[] = [];

    for (const lineIdx of importLines) {
      const parsed = parseImportLine(lines[lineIdx]);
      if (!parsed || parsed.sideEffectOnly) continue;

      let hasUsed = false;

      if (parsed.defaultImport && bodyIdentifiers.has(parsed.defaultImport)) {
        hasUsed = true;
      } else if (parsed.defaultImport) {
        parsed.defaultImport = null;
      }

      if (parsed.namespaceImport && bodyIdentifiers.has(parsed.namespaceImport)) {
        hasUsed = true;
      } else if (parsed.namespaceImport) {
        parsed.namespaceImport = null;
      }

      const usedNamed = parsed.namedImports.filter((name) => {
        const baseName = name.includes(' as ') ? name.split(' as ')[1].trim() : name;
        return bodyIdentifiers.has(baseName);
      });

      if (usedNamed.length > 0) hasUsed = true;
      parsed.namedImports = usedNamed;

      if (!hasUsed) {
        linesToRemove.push(lineIdx);
      } else {
        resultLines[lineIdx] = reconstructImport(parsed);
      }
    }

    // Remove lines in reverse order to preserve indices
    for (const idx of linesToRemove.reverse()) {
      resultLines.splice(idx, 1);
    }

    return fullFileEdit(ctx.sourceText, resultLines.join('\n'));
  },
};

// ─── 18. Add Missing Imports ────────────────────────────────────────────────

/** Known module map for auto-import resolution */
const KNOWN_MODULE_MAP: Record<string, { module: string; isDefault?: boolean }> = {
  React: { module: 'react', isDefault: true },
  useState: { module: 'react' }, useEffect: { module: 'react' },
  useCallback: { module: 'react' }, useMemo: { module: 'react' },
  useRef: { module: 'react' }, useContext: { module: 'react' },
  useReducer: { module: 'react' }, useLayoutEffect: { module: 'react' },
  useTransition: { module: 'react' }, useId: { module: 'react' },
  createContext: { module: 'react' }, forwardRef: { module: 'react' },
  memo: { module: 'react' }, lazy: { module: 'react' },
  Suspense: { module: 'react' }, Fragment: { module: 'react' },
  createRoot: { module: 'react-dom/client' },
  createPortal: { module: 'react-dom' },
  clsx: { module: 'clsx', isDefault: true },
  classNames: { module: 'classnames', isDefault: true },
  styled: { module: 'styled-components', isDefault: true },
  motion: { module: 'framer-motion' },
  AnimatePresence: { module: 'framer-motion' },
  Link: { module: 'react-router-dom' },
  useNavigate: { module: 'react-router-dom' },
  useParams: { module: 'react-router-dom' },
  useLocation: { module: 'react-router-dom' },
  Routes: { module: 'react-router-dom' },
  Route: { module: 'react-router-dom' },
  Outlet: { module: 'react-router-dom' },
};

const addMissingImports: Refactoring = {
  id: 'add-missing-imports',
  label: 'Add Missing Imports',
  description: 'Auto-add imports for known identifiers not yet imported',
  supportedLanguages: JS_LANGUAGES,

  canApply(ctx) {
    if (!isLanguageSupported(ctx.language, this.supportedLanguages)) return false;
    const bodyIds = extractIdentifiers(ctx.sourceText);
    const importedIds = new Set<string>();
    const importRegex = /^import\s.*from\s+['"].*['"]/gm;
    let m: RegExpExecArray | null;
    while ((m = importRegex.exec(ctx.sourceText)) !== null) {
      const ids = extractIdentifiers(m[0]);
      ids.forEach((id) => importedIds.add(id));
    }
    return bodyIds.some((id) => KNOWN_MODULE_MAP[id] && !importedIds.has(id));
  },

  apply(ctx) {
    const bodyIds = extractIdentifiers(ctx.sourceText);
    const importedIds = new Set<string>();
    const importRegex = /^import\s.*from\s+['"].*['"]/gm;
    let m: RegExpExecArray | null;
    while ((m = importRegex.exec(ctx.sourceText)) !== null) {
      extractIdentifiers(m[0]).forEach((id) => importedIds.add(id));
    }

    // Group missing identifiers by module
    const moduleGroups = new Map<string, { defaults: string[]; named: string[] }>();
    for (const id of bodyIds) {
      const known = KNOWN_MODULE_MAP[id];
      if (!known || importedIds.has(id)) continue;
      if (!moduleGroups.has(known.module)) {
        moduleGroups.set(known.module, { defaults: [], named: [] });
      }
      const group = moduleGroups.get(known.module)!;
      if (known.isDefault) {
        group.defaults.push(id);
      } else {
        group.named.push(id);
      }
    }

    if (moduleGroups.size === 0) return { edits: [] };

    // Build import statements
    const newImports: string[] = [];
    for (const [mod, group] of moduleGroups) {
      const parts: string[] = [];
      if (group.defaults.length > 0) parts.push(group.defaults[0]);
      if (group.named.length > 0) parts.push(`{ ${group.named.sort().join(', ')} }`);
      newImports.push(`import ${parts.join(', ')} from '${mod}';`);
    }

    // Insert at top of file (after existing imports if any)
    const firstImport = ctx.sourceText.search(/^import\s/m);
    let insertPos: number;
    if (firstImport >= 0) {
      // Find end of import block
      const lines = ctx.sourceText.split('\n');
      let lastImportLine = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('import ')) lastImportLine = i;
      }
      insertPos = lines.slice(0, lastImportLine + 1).join('\n').length + 1;
    } else {
      insertPos = 0;
    }

    const importText = newImports.join('\n') + '\n';
    const newSource = ctx.sourceText.slice(0, insertPos) + importText + ctx.sourceText.slice(insertPos);
    return fullFileEdit(ctx.sourceText, newSource);
  },
};

// ─── 19. Convert Default <-> Named Export ───────────────────────────────────

const convertExportStyle: Refactoring = {
  id: 'convert-export-style',
  label: 'Convert Export Style',
  description: 'Convert between default and named export',
  supportedLanguages: JS_LANGUAGES,

  canApply(ctx) {
    if (!isLanguageSupported(ctx.language, this.supportedLanguages)) return false;
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();
    return /^export\s+(default\s+)?/.test(text);
  },

  apply(ctx) {
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();

    // export default -> export (named)
    if (/^export\s+default\s+/.test(text)) {
      const result = text
        .replace(/^export\s+default\s+function\s*\(/, 'export function defaultExport(')
        .replace(/^export\s+default\s+class\s*\{/, 'export class DefaultExport {')
        .replace(/^export\s+default\s+/, 'export const defaultExport = ');
      return singleEdit(ctx.sourceText, ctx.selection, result);
    }

    // Named export -> default
    const namedFnMatch = text.match(/^export\s+(?:async\s+)?function\s+(\w+)/);
    if (namedFnMatch) {
      const result = text.replace(
        /^export\s+((?:async\s+)?function\s+\w+)/,
        'export default $1'
      );
      return singleEdit(ctx.sourceText, ctx.selection, result);
    }

    const namedClassMatch = text.match(/^export\s+class\s+(\w+)/);
    if (namedClassMatch) {
      const result = text.replace(/^export\s+class/, 'export default class');
      return singleEdit(ctx.sourceText, ctx.selection, result);
    }

    const namedConstMatch = text.match(/^export\s+const\s+(\w+)\s*=/);
    if (namedConstMatch) {
      const varName = namedConstMatch[1];
      const result = text.replace(
        /^export\s+const\s+\w+\s*=\s*/,
        'export default '
      );
      return singleEdit(ctx.sourceText, ctx.selection, result);
    }

    return { edits: [] };
  },
};

// ─── 20. Convert Type <-> Interface (TypeScript) ────────────────────────────

const convertTypeInterface: Refactoring = {
  id: 'convert-type-interface',
  label: 'Convert Type / Interface',
  description: 'Convert between TypeScript type alias and interface declaration',
  supportedLanguages: TS_ONLY,

  canApply(ctx) {
    if (!isLanguageSupported(ctx.language, this.supportedLanguages)) return false;
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();
    return /^(export\s+)?(type|interface)\s+\w+/.test(text);
  },

  apply(ctx) {
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();

    // Type -> Interface
    const typeMatch = text.match(
      /^(export\s+)?type\s+(\w+)(?:<([^>]*)>)?\s*=\s*\{([\s\S]*)\}\s*;?\s*$/
    );
    if (typeMatch) {
      const [, exportKw, name, generics, body] = typeMatch;
      const prefix = exportKw || '';
      const genericPart = generics ? `<${generics}>` : '';
      const result = `${prefix}interface ${name}${genericPart} {${body}}`;
      return singleEdit(ctx.sourceText, ctx.selection, result);
    }

    // Interface -> Type
    const interfaceMatch = text.match(
      /^(export\s+)?interface\s+(\w+)(?:<([^>]*)>)?\s*(?:extends\s+([\w,\s]+))?\s*\{([\s\S]*)\}\s*$/
    );
    if (interfaceMatch) {
      const [, exportKw, name, generics, extends_, body] = interfaceMatch;
      const prefix = exportKw || '';
      const genericPart = generics ? `<${generics}>` : '';
      let bodyStr = body;
      // Convert semicolons to commas for type syntax
      bodyStr = bodyStr.replace(/;(\s*(?:\/\/.*)?$)/gm, ',$1');

      let baseType = '';
      if (extends_) {
        const extendedTypes = extends_.split(',').map((t) => t.trim());
        baseType = extendedTypes.join(' & ') + ' & ';
      }

      const result = `${prefix}type ${name}${genericPart} = ${baseType}{${bodyStr}};`;
      return singleEdit(ctx.sourceText, ctx.selection, result);
    }

    return { edits: [] };
  },
};

// ─── 21. Generate Getter/Setter ─────────────────────────────────────────────

const generateGetterSetter: Refactoring = {
  id: 'generate-getter-setter',
  label: 'Generate Getter/Setter',
  description: 'Generate get/set accessor methods from a class property',
  supportedLanguages: JS_LANGUAGES,

  canApply(ctx) {
    if (!isLanguageSupported(ctx.language, this.supportedLanguages)) return false;
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();
    // Match class property declarations: private name: type; or name = value;
    return /^(?:private|protected|public|readonly)?\s*\w+\s*(?::\s*\w+(?:<[^>]*>)?)?(?:\s*=\s*.+)?;?\s*$/.test(text);
  },

  apply(ctx) {
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();
    const indent = getIndentAtOffset(ctx.sourceText, ctx.selection.start);

    // Parse property: [modifier] name[: type] [= value];
    const propMatch = text.match(
      /^(?:(private|protected|public|readonly)\s+)?(\w+)\s*(?::\s*(\w+(?:<[^>]*>)?))?\s*(?:=\s*(.+?))?\s*;?\s*$/
    );
    if (!propMatch) return { edits: [] };

    const [, , propName, propType] = propMatch;
    const capitalName = propName.charAt(0).toUpperCase() + propName.slice(1);
    const privateName = `_${propName}`;
    const typeAnnotation = propType ? `: ${propType}` : '';
    const returnType = propType ? `: ${propType}` : '';

    // Replace the property with private backing field + getter + setter
    const privateField = `${indent}private ${privateName}${typeAnnotation};`;

    const getter = [
      ``,
      `${indent}get ${propName}()${returnType} {`,
      `${indent}  return this.${privateName};`,
      `${indent}}`,
    ].join('\n');

    const setter = [
      ``,
      `${indent}set ${propName}(value${typeAnnotation}) {`,
      `${indent}  this.${privateName} = value;`,
      `${indent}}`,
    ].join('\n');

    const result = privateField + getter + setter;
    return singleEdit(ctx.sourceText, ctx.selection, result);
  },
};

// ─── 22. Toggle Arrow Function Braces ───────────────────────────────────────

const toggleArrowBraces: Refactoring = {
  id: 'toggle-arrow-braces',
  label: 'Toggle Arrow Function Braces',
  description: 'Toggle between concise and block body for arrow functions',
  supportedLanguages: JS_LANGUAGES,

  canApply(ctx) {
    if (!isLanguageSupported(ctx.language, this.supportedLanguages)) return false;
    const text = getSelectedText(ctx.sourceText, ctx.selection).trim();
    return /=>\s*/.test(text);
  },

  apply(ctx) {
    const text = getSelectedText(ctx.sourceText, ctx.selection);

    // Block body -> expression body
    const blockMatch = text.match(/([\s\S]*?=>\s*)\{\s*return\s+([\s\S]*?)\s*;\s*\}(\s*)$/);
    if (blockMatch) {
      const [, before, expr, trailing] = blockMatch;
      const result = `${before}${expr}${trailing}`;
      return singleEdit(ctx.sourceText, ctx.selection, result);
    }

    // Expression body -> block body
    const exprMatch = text.match(/([\s\S]*?=>\s*)((?!\{)[\s\S]+)$/);
    if (exprMatch) {
      const [, before, expr] = exprMatch;
      const cleanExpr = expr.trim().replace(/;$/, '');
      const result = `${before}{\n  return ${cleanExpr};\n}`;
      return singleEdit(ctx.sourceText, ctx.selection, result);
    }

    return { edits: [] };
  },
};

// ─── Registry ────────────────────────────────────────────────────────────────

const allRefactorings: Refactoring[] = [
  extractVariable,
  extractFunction,
  extractComponent,
  inlineVariable,
  renameSymbol,
  convertFunctionArrow,
  convertStringTemplate,
  convertTernary,
  convertForToArrayMethod,
  convertPromiseToAsyncAwait,
  toggleAsync,
  wrapInTryCatch,
  wrapInIfCondition,
  toggleOptionalChaining,
  toggleNullishCoalescing,
  sortImports,
  removeUnusedImports,
  addMissingImports,
  convertExportStyle,
  convertTypeInterface,
  generateGetterSetter,
  toggleArrowBraces,
];

export type RefactoringId =
  | 'extract-variable'
  | 'extract-function'
  | 'extract-component'
  | 'inline-variable'
  | 'rename-symbol'
  | 'convert-function-arrow'
  | 'convert-string-template'
  | 'convert-ternary'
  | 'convert-for-to-array-method'
  | 'convert-promise-to-async-await'
  | 'toggle-async'
  | 'wrap-try-catch'
  | 'wrap-in-if'
  | 'toggle-optional-chaining'
  | 'toggle-nullish-coalescing'
  | 'sort-imports'
  | 'remove-unused-imports'
  | 'add-missing-imports'
  | 'convert-export-style'
  | 'convert-type-interface'
  | 'generate-getter-setter'
  | 'toggle-arrow-braces';

/**
 * Registry providing lookup, filtering, and execution of all refactorings.
 */
export class RefactoringRegistry {
  private refactorings: Map<string, Refactoring> = new Map();

  constructor(initialRefactorings?: Refactoring[]) {
    const items = initialRefactorings ?? allRefactorings;
    for (const r of items) {
      this.refactorings.set(r.id, r);
    }
  }

  /** Register a custom refactoring */
  register(refactoring: Refactoring): void {
    this.refactorings.set(refactoring.id, refactoring);
  }

  /** Unregister a refactoring by id */
  unregister(id: string): boolean {
    return this.refactorings.delete(id);
  }

  /** Get a refactoring by its id */
  get(id: string): Refactoring | undefined {
    return this.refactorings.get(id);
  }

  /** Get all registered refactorings */
  getAll(): Refactoring[] {
    return [...this.refactorings.values()];
  }

  /** Get refactorings applicable to the given context */
  getAvailable(ctx: RefactoringContext): Refactoring[] {
    return [...this.refactorings.values()].filter((r) => {
      try {
        return r.canApply(ctx);
      } catch {
        return false;
      }
    });
  }

  /** Get refactorings applicable to a specific language */
  getForLanguage(lang: RefactoringLanguage): Refactoring[] {
    return [...this.refactorings.values()].filter((r) =>
      r.supportedLanguages.includes(lang)
    );
  }

  /** Apply a refactoring by id, returning null if not found or not applicable */
  apply(id: string, ctx: RefactoringContext): RefactoringResult | null {
    const refactoring = this.refactorings.get(id);
    if (!refactoring || !refactoring.canApply(ctx)) return null;
    return refactoring.apply(ctx);
  }
}

/** Default global registry instance with all built-in refactorings */
export const refactoringRegistry = new RefactoringRegistry();

// ─── Convenience Functions ──────────────────────────────────────────────────

/**
 * Returns all refactoring actions applicable to the given context.
 */
export function getAvailableRefactorings(ctx: RefactoringContext): Refactoring[] {
  return refactoringRegistry.getAvailable(ctx);
}

/**
 * Look up a specific refactoring by its id.
 */
export function getRefactoringById(id: string): Refactoring | undefined {
  return refactoringRegistry.get(id);
}

/**
 * Apply a refactoring by id. Returns null if the refactoring is not found
 * or cannot be applied.
 */
export function applyRefactoring(
  id: string,
  ctx: RefactoringContext
): RefactoringResult | null {
  return refactoringRegistry.apply(id, ctx);
}

/**
 * Get all registered refactoring IDs and labels for display.
 */
export function listRefactorings(): Array<{ id: string; label: string; description: string }> {
  return refactoringRegistry.getAll().map((r) => ({
    id: r.id,
    label: r.label,
    description: r.description,
  }));
}
