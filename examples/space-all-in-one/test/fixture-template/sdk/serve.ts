export function serve(handler: (ctx: { res: { writeHead: (status: number, headers: Record<string, string>) => { end: (body: string) => void } } }) => void): void {
  void handler;
}
