// File included to suppress recommendation from vscode.typescript-language-features ts(7016)
// See: https://github.com/microsoft/TypeScript/issues/32148

declare module 'weblab-utils' {
  export function DaysHoursMinutesToSeconds(
    days: number,
    hours: number,
    minutes: number
  ): number;
  export function dateStringMMDDYY(): string;
  export function dateStringYMDHMS(): string;
  export function getArrayLength(arr: any[]): number;
  export function ask(rl: any, query: string): Promise;
}
