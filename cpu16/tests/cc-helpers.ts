// cc16 testleri için ortak yardımcılar: derle, bağla, emülatörde çalıştır.
// Her çalıştırmada ROM'a (0x4000 altı) yazma olmadığı da doğrulanır.

import { expect } from "vitest";
import { buildProgram, formatErrors, type BuildResult, type CcError, type CompileOptions } from "../cc/index.ts";
import { loadLib } from "../cc/node.ts";
import { runProgram, type RunResult } from "../cc/run.ts";

export const LIB = loadLib();

export type Sources = string | Record<string, string>;

export function build(src: Sources, opts: CompileOptions = {}): BuildResult {
  const files = typeof src === "string" ? { "main.c": src } : src;
  const entry = Object.keys(files).filter((k) => /\.(c|s)$/.test(k));
  return buildProgram(files, entry, { lib: LIB, ...opts });
}

export interface CRun extends RunResult {
  b: BuildResult;
  /** sembolün (C adı) i. kelimesi, işaretsiz */
  word(name: string, i?: number): number;
  /** sembolün i. 32 bitlik elemanı, işaretsiz */
  dword(name: string, i?: number): number;
  byte(name: string, i?: number): number;
}

export function runC(src: Sources, opts: CompileOptions & { maxSteps?: number } = {}): CRun {
  const b = build(src, opts);
  if (b.errors.length) throw new Error(formatErrors(b.errors));
  const r = runProgram(b.image, { maxSteps: opts.maxSteps ?? 30_000_000 });
  expect(r.result, `program durmadı (PC=0x${r.cpu.pc.toString(16)})`).toBe("halted");
  expect(r.romWrites, "ROM'a yazma olmamalı").toBe(0);
  const addr = (name: string) => {
    const a = b.symbols.get(`_${name}`);
    if (a === undefined) throw new Error(`sembol yok: ${name}`);
    return a;
  };
  const mem = r.bus.mem;
  return {
    ...r,
    b,
    word: (name, i = 0) => {
      const a = addr(name) + 2 * i;
      return mem[a] | (mem[a + 1] << 8);
    },
    dword: (name, i = 0) => {
      const a = addr(name) + 4 * i;
      return (mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16) | (mem[a + 3] << 24)) >>> 0;
    },
    byte: (name, i = 0) => mem[addr(name) + i],
  };
}

/** Programı çalıştırıp UART çıktısını döndürür. */
export function out(src: Sources, opts: CompileOptions & { maxSteps?: number } = {}): string {
  return runC(src, opts).output;
}

/** main'in dönüş değeri (işaretli 16 bit). */
export function exitOf(src: Sources, opts: CompileOptions = {}): number {
  return runC(src, opts).exitCode;
}

/** Derleme/bağlama hataları (beklenen hatalı programlar için). */
export function errorsOf(src: Sources, opts: CompileOptions = {}): CcError[] {
  return build(src, opts).errors;
}

/** Tek bir ifadenin değerini main'den döndürerek hesaplar. */
export function evalInt(expr: string, decls = ""): number {
  return exitOf(`${decls}\nint main(void) { return ${expr}; }`);
}
