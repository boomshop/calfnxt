export type IrNode = {
  n: string;
  d?: number;
  p?: string;
  c?: IrNode[];
};

export type IrHostMsg = {
  t: "ir";
  cmd: string;
  path?: string;
  root?: string;
  sel?: string;
  status?: string;
  tree?: IrNode[];
  open?: string[];
  scroll?: number;
};
