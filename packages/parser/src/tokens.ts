export enum TokenType {
  Identifier = 'Identifier',
  StringLiteral = 'StringLiteral',
  NumberLiteral = 'NumberLiteral',
  BooleanLiteral = 'BooleanLiteral',

  // Keywords
  Use = 'Use',
  Import = 'Import',
  Const = 'Const',
  Data = 'Data',
  Func = 'Func',
  Theme = 'Theme',
  Style = 'Style',
  Sub = 'Sub',
  Algo = 'Algo',
  Pseudo = 'Pseudo',
  Chart = 'Chart',
  Flow = 'Flow',
  Diagram = 'Diagram',
  Table = 'Table',
  Plot3d = 'Plot3d',
  Scene3d = 'Scene3d',
  Erd = 'Erd',
  Infra = 'Infra',
  Page = 'Page',
  Render = 'Render',

  // Punctuation
  Colon = 'Colon',
  Equals = 'Equals',
  Comma = 'Comma',
  Dot = 'Dot',
  LBracket = 'LBracket',
  RBracket = 'RBracket',
  LParen = 'LParen',
  RParen = 'RParen',
  LBrace = 'LBrace',
  RBrace = 'RBrace',
  Arrow = 'Arrow',

  // Formatting
  Indent = 'Indent',
  Dedent = 'Dedent',
  Newline = 'Newline',
  EOF = 'EOF',

  // Operators
  Plus = 'Plus',
  Minus = 'Minus',
  Star = 'Star',
  Slash = 'Slash',
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}
