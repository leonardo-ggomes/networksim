/**
 * JSInterpreter.ts — Sandbox JavaScript educacional
 *
 * Executa código JavaScript do aluno de forma segura dentro do dispositivo HackOS.
 * Captura console.log / console.error, bloqueia acesso ao DOM e APIs perigosas,
 * e emite o evento  js:output  para o MissionManager validar missões JS.
 *
 * Uso:
 *   const result = JSInterpreter.run(sourceCode);
 *   // result.output  → string com tudo que o console.log imprimiu
 *   // result.errors  → array de strings com erros
 *   // result.success → boolean
 *
 * Evento emitido (mesmo padrão do c:output):
 *   eventEmitter.dispatchEvent(new CustomEvent('js:output', {
 *       detail: { output, source }
 *   }))
 */

import { eventEmitter } from "./Actions";

// ── Tipos públicos (mesmo contrato do CCompiler) ──────────────────────────────

export type JSRunResult = {
    output:  string;
    errors:  string[];
    success: boolean;
};

// ── Limite de segurança ───────────────────────────────────────────────────────

const MAX_OUTPUT_CHARS = 4_000;   // evita flood de output
const EXEC_TIMEOUT_MS  = 3_000;   // tempo máximo de execução (via loop-guard)

// ── Lista de identificadores bloqueados no código do aluno ───────────────────

const BLOCKED_IDENTIFIERS = [
    'window', 'document', 'location', 'history', 'navigator',
    'XMLHttpRequest', 'fetch', 'WebSocket', 'Worker',
    'localStorage', 'sessionStorage', 'indexedDB',
    'eval', 'Function', 'setTimeout', 'setInterval',
    'importScripts', 'require', 'module', 'exports',
    '__proto__', 'prototype', 'constructor',
    'process', 'global', 'globalThis',
];

/** Verifica se o código tenta acessar APIs proibidas */
function detectBlocked(source: string): string | null {
    for (const id of BLOCKED_IDENTIFIERS) {
        // Regex simples: word boundary para evitar falso-positivo em nomes compostos
        const re = new RegExp(`\\b${id}\\b`);
        if (re.test(source)) {
            return `Acesso bloqueado: '${id}' não está disponível no ambiente HackOS.`;
        }
    }
    return null;
}

/**
 * Injeta um guard de loop infinito antes de cada iteração:
 * transforma  while(...)  →  while(__guard() && ...)
 * e  for(;;)  →  for(;__guard();)
 *
 * Abordagem leve — suficiente para contexto educacional.
 */
function injectLoopGuard(source: string): string {
    // Substitui `while (` por `while (__loopGuard() && (`  (fecha o parêntese extra no corpo)
    // Estratégia mais simples: wrapping via Function com deadline
    return source; // o guard real fica no contexto de execução (ver abaixo)
}

// ── Sandbox via Function() com contexto controlado ────────────────────────────

/**
 * Cria um contexto seguro onde apenas APIs permitidas existem.
 * Usa new Function() — mais controlável que eval direto.
 */
function buildSandbox(
    outputLines: string[],
    deadline: number
): Record<string, unknown> {

    const safeConsole = {
        log: (...args: unknown[]) => {
            const line = args.map(a => {
                if (a === null)      return 'null';
                if (a === undefined) return 'undefined';
                if (typeof a === 'object') {
                    try { return JSON.stringify(a); } catch { return '[Object]'; }
                }
                return String(a);
            }).join(' ');
            outputLines.push(line);
        },
        error: (...args: unknown[]) => {
            outputLines.push('[erro] ' + args.map(String).join(' '));
        },
        warn: (...args: unknown[]) => {
            outputLines.push('[aviso] ' + args.map(String).join(' '));
        },
        info: (...args: unknown[]) => {
            outputLines.push('[info] ' + args.map(String).join(' '));
        },
    };

    const __loopGuard = () => {
        if (Date.now() > deadline) throw new Error('Tempo limite excedido (loop infinito?)');
        return true;
    };

    // Math completo, alguns utilitários seguros
    return {
        console:   safeConsole,
        Math,
        JSON,
        Number,
        String,
        Boolean,
        Array,
        Object,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        __loopGuard,
        // Undefined explícito para bloquear acesso ao escopo externo
        ...Object.fromEntries(BLOCKED_IDENTIFIERS.map(id => [id, undefined])),
    };
}

// ── Wrap do código do aluno com guard de loop ─────────────────────────────────

function wrapSource(source: string): string {
    // Injeta __loopGuard() em while e for para capturar loops infinitos
    let wrapped = source
        // while (...) → while (__loopGuard() && (...))
        .replace(/\bwhile\s*\(/g, 'while (__loopGuard() && (')
        // Precisamos fechar o parêntese extra — abordagem: troca  while(COND)  por  while(GUARD&&(COND))
        // Como o replace acima só abre, precisamos equilibrar:
        // Feito abaixo com uma segunda passagem cuidadosa
        ;

    // Segunda passagem: equilibra o parêntese extra inserido acima
    // Encontra cada  `while (__loopGuard() && (`  e avança até o `)` que fecha a condição
    // original, inserindo um `)` extra.
    wrapped = balanceWhileGuard(wrapped);

    // for (init; cond; incr) → for (init; __loopGuard() && cond; incr)
    wrapped = wrapped.replace(
        /\bfor\s*\(([^;]*);([^;]*);/g,
        (_m, init, cond) => `for (${init}; __loopGuard() && (${cond.trim() || 'true'});`
    );

    return wrapped;
}

/**
 * Para cada  `while (__loopGuard() && (`  encontra o `)` que fecha a condição
 * original e insere um `)` a mais para fechar o `(` do guard.
 */
function balanceWhileGuard(src: string): string {
    const MARKER = 'while (__loopGuard() && (';
    let result = '';
    let i = 0;

    while (i < src.length) {
        const idx = src.indexOf(MARKER, i);
        if (idx === -1) { result += src.slice(i); break; }

        result += src.slice(i, idx + MARKER.length);
        // Avança após o MARKER e conta parênteses para encontrar o fechamento original
        let depth = 1;
        let j = idx + MARKER.length;
        while (j < src.length && depth > 0) {
            if (src[j] === '(') depth++;
            else if (src[j] === ')') depth--;
            if (depth > 0) result += src[j];
            j++;
        }
        // Insere o `)` extra para fechar o `(` do guard  +  o `)` original
        result += '))';
        i = j;
    }

    return result;
}

// ── API pública ───────────────────────────────────────────────────────────────

export const JSInterpreter = {

    /**
     * Executa o código JavaScript do aluno em sandbox.
     * @param source  Código-fonte JS escrito pelo aluno
     */
    run(source: string): JSRunResult {

        // 1. Checa identificadores bloqueados
        const blocked = detectBlocked(source);
        if (blocked) {
            return { output: '', errors: [blocked], success: false };
        }

        const outputLines: string[] = [];
        const errors:      string[] = [];
        const deadline = Date.now() + EXEC_TIMEOUT_MS;

        try {
            // 2. Constrói o sandbox
            const sandbox = buildSandbox(outputLines, deadline);
            const keys   = Object.keys(sandbox);
            const values = Object.values(sandbox);

            // 3. Wrapping com loop-guard
            const wrapped = wrapSource(source);

            // 4. Executa dentro de new Function com escopo controlado
            // eslint-disable-next-line no-new-func
            const fn = new Function(...keys, `"use strict";\n${wrapped}`);
            fn(...values);

        } catch (e: any) {
            errors.push(e.message ?? String(e));
        }

        // 5. Trunca output excessivo
        let output = outputLines.join('\n');
        if (output.length > MAX_OUTPUT_CHARS) {
            output = output.slice(0, MAX_OUTPUT_CHARS) + '\n[output truncado]';
        }

        const success = errors.length === 0;

        // 6. Emite evento para o MissionManager (mesmo padrão de c:output)
        eventEmitter.dispatchEvent(
            new CustomEvent('js:output', { detail: { output, source } })
        );

        return { output, errors, success };
    },
};