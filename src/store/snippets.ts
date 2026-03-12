import { create } from 'zustand'

export interface Snippet {
  id: string
  name: string
  prefix: string
  body: string
  description: string
  language: string
  isBuiltin: boolean
}

interface SnippetStore {
  snippets: Snippet[]
  userSnippets: Snippet[]
  createSnippet: (snippet: Omit<Snippet, 'id' | 'isBuiltin'>) => void
  updateSnippet: (id: string, changes: Partial<Omit<Snippet, 'id' | 'isBuiltin'>>) => void
  deleteSnippet: (id: string) => void
  getSnippetsForLanguage: (langId: string) => Snippet[]
  // Legacy compat
  addSnippet: (snippet: Omit<Snippet, 'id' | 'isBuiltin'>) => void
  removeSnippet: (id: string) => void
  importSnippets: (snippets: Array<Partial<Snippet> & { prefix: string; body: string }>) => void
  exportSnippets: () => Snippet[]
}

let _nextId = 1
function genId(): string {
  return `snippet_${Date.now()}_${_nextId++}`
}

// ── Built-in snippets ────────────────────────────────────────────────

const BUILTIN_SNIPPETS: Snippet[] = [
  // ─── JavaScript ─────────────────────────────────────────────────────
  {
    id: 'builtin_js_if',
    name: 'If Statement',
    prefix: 'if',
    body: 'if (${1:condition}) {\n\t$0\n}',
    description: 'If statement',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_js_ife',
    name: 'If/Else Statement',
    prefix: 'ife',
    body: 'if (${1:condition}) {\n\t$2\n} else {\n\t$0\n}',
    description: 'If/else block',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_js_for',
    name: 'For Loop',
    prefix: 'for',
    body: 'for (let ${1:i} = 0; ${1:i} < ${2:length}; ${1:i}++) {\n\t$0\n}',
    description: 'For loop',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_js_fore',
    name: 'ForEach',
    prefix: 'forEach',
    body: '${1:array}.forEach((${2:item}) => {\n\t$0\n});',
    description: 'Array forEach',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_js_map',
    name: 'Array Map',
    prefix: 'map',
    body: '${1:array}.map((${2:item}) => {\n\t$0\n});',
    description: 'Array map',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_js_filter',
    name: 'Array Filter',
    prefix: 'filter',
    body: '${1:array}.filter((${2:item}) => {\n\t$0\n});',
    description: 'Array filter',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_js_reduce',
    name: 'Array Reduce',
    prefix: 'reduce',
    body: '${1:array}.reduce((${2:acc}, ${3:item}) => {\n\t$0\n\treturn ${2:acc};\n}, ${4:initialValue});',
    description: 'Array reduce',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_js_switch',
    name: 'Switch Statement',
    prefix: 'switch',
    body: 'switch (${1:expression}) {\n\tcase ${2:value}:\n\t\t$3\n\t\tbreak;\n\tdefault:\n\t\t$0\n\t\tbreak;\n}',
    description: 'Switch statement',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_js_try',
    name: 'Try/Catch',
    prefix: 'trycatch',
    body: 'try {\n\t$1\n} catch (${2:error}) {\n\t$0\n}',
    description: 'Try/catch block',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_js_async',
    name: 'Async Function',
    prefix: 'async',
    body: 'async function ${1:name}(${2:params}) {\n\t$0\n}',
    description: 'Async function declaration',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_js_await',
    name: 'Await Expression',
    prefix: 'await',
    body: 'const ${1:result} = await ${2:promise};',
    description: 'Await expression',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_js_promise',
    name: 'Promise',
    prefix: 'promise',
    body: 'new Promise((resolve, reject) => {\n\t$0\n});',
    description: 'New Promise',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_js_class',
    name: 'Class',
    prefix: 'class',
    body: 'class ${1:Name} {\n\tconstructor(${2:params}) {\n\t\t$0\n\t}\n}',
    description: 'Class definition',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_js_imp',
    name: 'Import',
    prefix: 'import',
    body: "import { $2 } from '${1:module}';",
    description: 'Named import statement',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_js_impd',
    name: 'Import Default',
    prefix: 'importd',
    body: "import ${2:name} from '${1:module}';",
    description: 'Default import statement',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_js_exp',
    name: 'Export',
    prefix: 'export',
    body: 'export ${1|default,|} $0;',
    description: 'Export statement',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_js_arrow',
    name: 'Arrow Function',
    prefix: 'arrow',
    body: 'const ${1:name} = (${2:params}) => {\n\t$0\n};',
    description: 'Arrow function',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_js_log',
    name: 'Console Log',
    prefix: 'log',
    body: 'console.log($1);',
    description: 'Console log statement',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_js_timeout',
    name: 'Set Timeout',
    prefix: 'setTimeout',
    body: 'setTimeout(() => {\n\t$0\n}, ${1:1000});',
    description: 'setTimeout call',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_js_interval',
    name: 'Set Interval',
    prefix: 'setInterval',
    body: 'const ${1:intervalId} = setInterval(() => {\n\t$0\n}, ${2:1000});',
    description: 'setInterval call',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_js_fn',
    name: 'Function',
    prefix: 'fn',
    body: 'function ${1:name}(${2:params}) {\n\t$0\n}',
    description: 'Function declaration',
    language: 'javascript',
    isBuiltin: true,
  },

  // ─── TypeScript ─────────────────────────────────────────────────────
  {
    id: 'builtin_ts_if',
    name: 'If Statement',
    prefix: 'if',
    body: 'if (${1:condition}) {\n\t$0\n}',
    description: 'If statement',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_ife',
    name: 'If/Else Statement',
    prefix: 'ife',
    body: 'if (${1:condition}) {\n\t$2\n} else {\n\t$0\n}',
    description: 'If/else block',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_for',
    name: 'For Loop',
    prefix: 'for',
    body: 'for (let ${1:i} = 0; ${1:i} < ${2:length}; ${1:i}++) {\n\t$0\n}',
    description: 'For loop',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_fore',
    name: 'ForEach',
    prefix: 'forEach',
    body: '${1:array}.forEach((${2:item}) => {\n\t$0\n});',
    description: 'Array forEach',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_map',
    name: 'Array Map',
    prefix: 'map',
    body: '${1:array}.map((${2:item}) => {\n\t$0\n});',
    description: 'Array map',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_filter',
    name: 'Array Filter',
    prefix: 'filter',
    body: '${1:array}.filter((${2:item}) => {\n\t$0\n});',
    description: 'Array filter',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_reduce',
    name: 'Array Reduce',
    prefix: 'reduce',
    body: '${1:array}.reduce((${2:acc}, ${3:item}) => {\n\t$0\n\treturn ${2:acc};\n}, ${4:initialValue});',
    description: 'Array reduce',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_switch',
    name: 'Switch Statement',
    prefix: 'switch',
    body: 'switch (${1:expression}) {\n\tcase ${2:value}:\n\t\t$3\n\t\tbreak;\n\tdefault:\n\t\t$0\n\t\tbreak;\n}',
    description: 'Switch statement',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_try',
    name: 'Try/Catch',
    prefix: 'trycatch',
    body: 'try {\n\t$1\n} catch (${2:error}) {\n\t$0\n}',
    description: 'Try/catch block',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_async',
    name: 'Async Function',
    prefix: 'async',
    body: 'async function ${1:name}(${2:params}): Promise<${3:void}> {\n\t$0\n}',
    description: 'Async function declaration',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_await',
    name: 'Await Expression',
    prefix: 'await',
    body: 'const ${1:result} = await ${2:promise};',
    description: 'Await expression',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_promise',
    name: 'Promise',
    prefix: 'promise',
    body: 'new Promise<${1:void}>((resolve, reject) => {\n\t$0\n});',
    description: 'New Promise',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_class',
    name: 'Class',
    prefix: 'class',
    body: 'class ${1:Name} {\n\tconstructor(${2:params}) {\n\t\t$0\n\t}\n}',
    description: 'Class definition',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_iface',
    name: 'Interface',
    prefix: 'interface',
    body: 'interface ${1:Name} {\n\t${2:property}: ${3:type};\n\t$0\n}',
    description: 'TypeScript interface',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_type',
    name: 'Type Alias',
    prefix: 'type',
    body: 'type ${1:Name} = ${0:string};',
    description: 'TypeScript type alias',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_enum',
    name: 'Enum',
    prefix: 'enum',
    body: 'enum ${1:Name} {\n\t${2:Value} = ${3:0},\n\t$0\n}',
    description: 'TypeScript enum',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_imp',
    name: 'Import',
    prefix: 'import',
    body: "import { $2 } from '${1:module}';",
    description: 'Named import statement',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_impd',
    name: 'Import Default',
    prefix: 'importd',
    body: "import ${2:name} from '${1:module}';",
    description: 'Default import statement',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_exp',
    name: 'Export',
    prefix: 'export',
    body: 'export ${1|default,|} $0;',
    description: 'Export statement',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_arrow',
    name: 'Arrow Function',
    prefix: 'arrow',
    body: 'const ${1:name} = (${2:params}): ${3:void} => {\n\t$0\n};',
    description: 'Typed arrow function',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_log',
    name: 'Console Log',
    prefix: 'log',
    body: 'console.log($1);',
    description: 'Console log statement',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_timeout',
    name: 'Set Timeout',
    prefix: 'setTimeout',
    body: 'setTimeout(() => {\n\t$0\n}, ${1:1000});',
    description: 'setTimeout call',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_interval',
    name: 'Set Interval',
    prefix: 'setInterval',
    body: 'const ${1:intervalId} = setInterval(() => {\n\t$0\n}, ${2:1000});',
    description: 'setInterval call',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_ts_fn',
    name: 'Function',
    prefix: 'fn',
    body: 'function ${1:name}(${2:params}): ${3:void} {\n\t$0\n}',
    description: 'Typed function declaration',
    language: 'typescript',
    isBuiltin: true,
  },

  // ─── React (scoped to javascript & typescript) ──────────────────────
  {
    id: 'builtin_react_usestate',
    name: 'useState Hook',
    prefix: 'useState',
    body: 'const [${1:state}, set${2:State}] = useState(${3:initialValue});',
    description: 'React useState hook',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_react_useeffect',
    name: 'useEffect Hook',
    prefix: 'useEffect',
    body: 'useEffect(() => {\n\t$1\n\n\treturn () => {\n\t\t$2\n\t};\n}, [${3:deps}]);',
    description: 'React useEffect hook with cleanup',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_react_usecallback',
    name: 'useCallback Hook',
    prefix: 'useCallback',
    body: 'const ${1:memoizedFn} = useCallback((${2:params}) => {\n\t$0\n}, [${3:deps}]);',
    description: 'React useCallback hook',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_react_usememo',
    name: 'useMemo Hook',
    prefix: 'useMemo',
    body: 'const ${1:memoizedValue} = useMemo(() => {\n\t$0\n}, [${2:deps}]);',
    description: 'React useMemo hook',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_react_useref',
    name: 'useRef Hook',
    prefix: 'useRef',
    body: 'const ${1:ref} = useRef(${2:null});',
    description: 'React useRef hook',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_react_usecontext',
    name: 'useContext Hook',
    prefix: 'useContext',
    body: 'const ${1:value} = useContext(${2:MyContext});',
    description: 'React useContext hook',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_react_fc',
    name: 'Functional Component',
    prefix: 'rfc',
    body: "import React from 'react';\n\nexport default function ${1:Component}(${2:props}) {\n\treturn (\n\t\t<div>\n\t\t\t$0\n\t\t</div>\n\t);\n}",
    description: 'React functional component',
    language: 'javascript',
    isBuiltin: true,
  },
  {
    id: 'builtin_react_cc',
    name: 'Class Component',
    prefix: 'rcc',
    body: "import React, { Component } from 'react';\n\nclass ${1:MyComponent} extends Component {\n\tstate = {\n\t\t$2\n\t};\n\n\trender() {\n\t\treturn (\n\t\t\t<div>\n\t\t\t\t$0\n\t\t\t</div>\n\t\t);\n\t}\n}\n\nexport default ${1:MyComponent};",
    description: 'React class component',
    language: 'javascript',
    isBuiltin: true,
  },
  // React for TypeScript
  {
    id: 'builtin_react_ts_usestate',
    name: 'useState Hook (TS)',
    prefix: 'useState',
    body: 'const [${1:state}, set${2:State}] = useState<${3:type}>(${4:initialValue});',
    description: 'React useState hook with type',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_react_ts_useeffect',
    name: 'useEffect Hook',
    prefix: 'useEffect',
    body: 'useEffect(() => {\n\t$1\n\n\treturn () => {\n\t\t$2\n\t};\n}, [${3:deps}]);',
    description: 'React useEffect hook with cleanup',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_react_ts_usecallback',
    name: 'useCallback Hook',
    prefix: 'useCallback',
    body: 'const ${1:memoizedFn} = useCallback((${2:params}) => {\n\t$0\n}, [${3:deps}]);',
    description: 'React useCallback hook',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_react_ts_usememo',
    name: 'useMemo Hook',
    prefix: 'useMemo',
    body: 'const ${1:memoizedValue} = useMemo(() => {\n\t$0\n}, [${2:deps}]);',
    description: 'React useMemo hook',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_react_ts_useref',
    name: 'useRef Hook (TS)',
    prefix: 'useRef',
    body: 'const ${1:ref} = useRef<${2:HTMLDivElement}>(${3:null});',
    description: 'React useRef hook with type',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_react_ts_usecontext',
    name: 'useContext Hook',
    prefix: 'useContext',
    body: 'const ${1:value} = useContext(${2:MyContext});',
    description: 'React useContext hook',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_react_ts_fc',
    name: 'Functional Component (TS)',
    prefix: 'rfc',
    body: "interface ${1:Component}Props {\n\t$2\n}\n\nexport default function ${1:Component}({ $3 }: ${1:Component}Props) {\n\treturn (\n\t\t<div>\n\t\t\t$0\n\t\t</div>\n\t);\n}",
    description: 'React functional component with props interface',
    language: 'typescript',
    isBuiltin: true,
  },
  {
    id: 'builtin_react_ts_cc',
    name: 'Class Component (TS)',
    prefix: 'rcc',
    body: "import React, { Component } from 'react';\n\ninterface ${1:MyComponent}Props {\n\t$2\n}\n\ninterface ${1:MyComponent}State {\n\t$3\n}\n\nclass ${1:MyComponent} extends Component<${1:MyComponent}Props, ${1:MyComponent}State> {\n\tstate: ${1:MyComponent}State = {\n\t\t$4\n\t};\n\n\trender() {\n\t\treturn (\n\t\t\t<div>\n\t\t\t\t$0\n\t\t\t</div>\n\t\t);\n\t}\n}\n\nexport default ${1:MyComponent};",
    description: 'React class component with typed props and state',
    language: 'typescript',
    isBuiltin: true,
  },

  // ─── HTML ───────────────────────────────────────────────────────────
  {
    id: 'builtin_html_table',
    name: 'Table',
    prefix: 'table',
    body: '<table>\n\t<thead>\n\t\t<tr>\n\t\t\t<th>${1:Header}</th>\n\t\t\t<th>${2:Header}</th>\n\t\t</tr>\n\t</thead>\n\t<tbody>\n\t\t<tr>\n\t\t\t<td>${3:Data}</td>\n\t\t\t<td>${4:Data}</td>\n\t\t</tr>\n\t</tbody>\n</table>',
    description: 'HTML table with thead and tbody',
    language: 'html',
    isBuiltin: true,
  },
  {
    id: 'builtin_html_form',
    name: 'Form',
    prefix: 'form',
    body: '<form action="${1:#}" method="${2:post}">\n\t<label for="${3:input}">${4:Label}</label>\n\t<input type="${5:text}" id="${3:input}" name="${3:input}" />\n\t<button type="submit">${6:Submit}</button>\n</form>',
    description: 'HTML form with label and input',
    language: 'html',
    isBuiltin: true,
  },
  {
    id: 'builtin_html_link',
    name: 'Link (stylesheet)',
    prefix: 'link',
    body: '<link rel="stylesheet" href="${1:style.css}" />',
    description: 'HTML link tag for stylesheet',
    language: 'html',
    isBuiltin: true,
  },
  {
    id: 'builtin_html_meta',
    name: 'Meta Tag',
    prefix: 'meta',
    body: '<meta name="${1:description}" content="${2:content}" />',
    description: 'HTML meta tag',
    language: 'html',
    isBuiltin: true,
  },
  {
    id: 'builtin_html_script',
    name: 'Script Tag',
    prefix: 'script',
    body: '<script src="${1:script.js}"></script>',
    description: 'HTML script tag',
    language: 'html',
    isBuiltin: true,
  },
  {
    id: 'builtin_html_doc',
    name: 'HTML5 Boilerplate',
    prefix: 'html5',
    body: '<!DOCTYPE html>\n<html lang="${1:en}">\n<head>\n\t<meta charset="UTF-8" />\n\t<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n\t<title>${2:Document}</title>\n</head>\n<body>\n\t$0\n</body>\n</html>',
    description: 'HTML5 document boilerplate',
    language: 'html',
    isBuiltin: true,
  },

  // ─── Python ─────────────────────────────────────────────────────────
  {
    id: 'builtin_py_def',
    name: 'Function',
    prefix: 'def',
    body: 'def ${1:name}(${2:params}):\n\t${0:pass}',
    description: 'Function definition',
    language: 'python',
    isBuiltin: true,
  },
  {
    id: 'builtin_py_cls',
    name: 'Class',
    prefix: 'class',
    body: 'class ${1:Name}:\n\tdef __init__(self, ${2:params}):\n\t\t${0:pass}',
    description: 'Class definition',
    language: 'python',
    isBuiltin: true,
  },
  {
    id: 'builtin_py_ifm',
    name: 'If Main',
    prefix: 'ifmain',
    body: "if __name__ == '__main__':\n\t${0:main()}",
    description: 'if __name__ == "__main__" guard',
    language: 'python',
    isBuiltin: true,
  },
  {
    id: 'builtin_py_try',
    name: 'Try/Except',
    prefix: 'try',
    body: 'try:\n\t$1\nexcept ${2:Exception} as ${3:e}:\n\t$0',
    description: 'Try/except block',
    language: 'python',
    isBuiltin: true,
  },
  {
    id: 'builtin_py_with',
    name: 'With Statement',
    prefix: 'with',
    body: "with ${1:open('${2:file}')} as ${3:f}:\n\t$0",
    description: 'With statement / context manager',
    language: 'python',
    isBuiltin: true,
  },
  {
    id: 'builtin_py_for',
    name: 'For Loop',
    prefix: 'for',
    body: 'for ${1:item} in ${2:iterable}:\n\t$0',
    description: 'For loop',
    language: 'python',
    isBuiltin: true,
  },
  {
    id: 'builtin_py_if',
    name: 'If Statement',
    prefix: 'if',
    body: 'if ${1:condition}:\n\t$0',
    description: 'If statement',
    language: 'python',
    isBuiltin: true,
  },
  {
    id: 'builtin_py_lambda',
    name: 'Lambda',
    prefix: 'lambda',
    body: 'lambda ${1:x}: ${0:x}',
    description: 'Lambda expression',
    language: 'python',
    isBuiltin: true,
  },

  // ─── Global (all languages) ─────────────────────────────────────────
  {
    id: 'builtin_global_todo',
    name: 'TODO Comment',
    prefix: 'todo',
    body: '// TODO: $0',
    description: 'TODO comment',
    language: 'global',
    isBuiltin: true,
  },
  {
    id: 'builtin_global_fixme',
    name: 'FIXME Comment',
    prefix: 'fixme',
    body: '// FIXME: $0',
    description: 'FIXME comment',
    language: 'global',
    isBuiltin: true,
  },
  {
    id: 'builtin_global_region',
    name: 'Region',
    prefix: 'region',
    body: '// #region ${1:Region Name}\n$0\n// #endregion',
    description: 'Foldable region markers',
    language: 'global',
    isBuiltin: true,
  },
]

// Load user snippets from localStorage
function loadUserSnippets(): Snippet[] {
  try {
    const stored = localStorage.getItem('orion-user-snippets')
    if (stored) {
      const parsed = JSON.parse(stored) as Snippet[]
      // Migrate old snippets that lack `name` or `isBuiltin`
      return parsed.map((s) => ({
        ...s,
        name: s.name || s.prefix,
        isBuiltin: false,
      }))
    }
  } catch { /* ignore */ }
  return []
}

function saveUserSnippets(userSnippets: Snippet[]) {
  localStorage.setItem('orion-user-snippets', JSON.stringify(userSnippets))
}

export const useSnippetStore = create<SnippetStore>((set, get) => {
  const initialUserSnippets = loadUserSnippets()

  return {
    snippets: [...BUILTIN_SNIPPETS, ...initialUserSnippets],
    userSnippets: initialUserSnippets,

    createSnippet: (snippet) =>
      set((state) => {
        const newSnippet: Snippet = { ...snippet, id: genId(), isBuiltin: false }
        const nextUser = [...state.userSnippets, newSnippet]
        saveUserSnippets(nextUser)
        return {
          snippets: [...BUILTIN_SNIPPETS, ...nextUser],
          userSnippets: nextUser,
        }
      }),

    updateSnippet: (id, changes) =>
      set((state) => {
        // Cannot update built-in snippets
        if (!state.userSnippets.find((s) => s.id === id)) return state
        const nextUser = state.userSnippets.map((s) =>
          s.id === id ? { ...s, ...changes } : s
        )
        saveUserSnippets(nextUser)
        return {
          snippets: [...BUILTIN_SNIPPETS, ...nextUser],
          userSnippets: nextUser,
        }
      }),

    deleteSnippet: (id) =>
      set((state) => {
        // Cannot delete built-in snippets
        if (!state.userSnippets.find((s) => s.id === id)) return state
        const nextUser = state.userSnippets.filter((s) => s.id !== id)
        saveUserSnippets(nextUser)
        return {
          snippets: [...BUILTIN_SNIPPETS, ...nextUser],
          userSnippets: nextUser,
        }
      }),

    getSnippetsForLanguage: (langId: string) => {
      const state = get()
      const lang = langId.toLowerCase()
      const langAliases: Record<string, string[]> = {
        javascript: ['javascript', 'javascriptreact', 'jsx'],
        typescript: ['typescript', 'typescriptreact', 'tsx'],
        python: ['python'],
        html: ['html', 'htm'],
      }
      let matchLangs = [lang]
      for (const [canonical, aliases] of Object.entries(langAliases)) {
        if (aliases.includes(lang) || canonical === lang) {
          matchLangs = [canonical, ...aliases]
          break
        }
      }
      // For typescript-family, also include javascript snippets
      if (matchLangs.includes('typescript') || matchLangs.includes('typescriptreact')) {
        matchLangs = [...new Set([...matchLangs, 'javascript', 'javascriptreact', 'jsx'])]
      }
      // Always include global snippets
      matchLangs.push('global')
      return state.snippets.filter((s) => matchLangs.includes(s.language.toLowerCase()))
    },

    // Legacy compat aliases
    addSnippet: (snippet) => get().createSnippet(snippet),

    removeSnippet: (id) => get().deleteSnippet(id),

    importSnippets: (imported) =>
      set((state) => {
        const newUser = imported
          .filter((s) => !s.id?.startsWith('builtin_'))
          .map((s) => ({
            id: genId(),
            name: s.name || s.prefix,
            prefix: s.prefix,
            body: s.body,
            description: s.description || s.prefix,
            language: s.language || 'global',
            isBuiltin: false,
          }))
        const nextUser = [...state.userSnippets, ...newUser]
        saveUserSnippets(nextUser)
        return {
          snippets: [...BUILTIN_SNIPPETS, ...nextUser],
          userSnippets: nextUser,
        }
      }),

    exportSnippets: () => {
      // Export only user snippets
      return get().userSnippets
    },
  }
})
