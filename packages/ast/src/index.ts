export interface Node {
  type: string;
}

export interface Program extends Node {
  type: 'Program';
  body: Statement[];
}

export type Statement =
  | UseStatement
  | DataBlock
  | ChartBlock
  | FlowBlock;

export interface UseStatement extends Node {
  type: 'UseStatement';
  module: string;
}

export interface DataBlock extends Node {
  type: 'DataBlock';
  body: Assignment[];
}

export interface Assignment extends Node {
  type: 'Assignment';
  name: string;
  value: Expression;
}

export type Expression =
  | StringLiteral
  | NumberLiteral
  | ArrayLiteral
  | CallExpression;

export interface StringLiteral extends Node {
  type: 'StringLiteral';
  value: string;
}

export interface NumberLiteral extends Node {
  type: 'NumberLiteral';
  value: number;
}

export interface ArrayLiteral extends Node {
  type: 'ArrayLiteral';
  elements: Expression[];
}

export interface CallExpression extends Node {
  type: 'CallExpression';
  callee: string;
  args: Expression[];
}

export interface ChartBlock extends Node {
  type: 'ChartBlock';
  name: string;
  body: Assignment[];
}

export interface FlowBlock extends Node {
  type: 'FlowBlock';
  name: string;
  body: any[]; // refine later
}
