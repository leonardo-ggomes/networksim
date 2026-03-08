/**
 * CCompiler.ts — Interpretador de C educacional
 *
 * Suporta:
 *   - Variáveis: int, float, char, string (extensão pedagógica)
 *   - Aritmética: + - * / % com precedência correta
 *   - Condicionais: if / else if / else
 *   - Loops: while, for
 *   - printf com %d %f %c %s
 *   - scanf simulado (valores pré-definidos pela missão)
 *   - Funções: main() obrigatória, funções simples sem ponteiros
 *   - Comentários: // e /* */


export type CompileResult = {
    output:  string;
    errors:  string[];
    success: boolean;
};

// ── Tipos internos ────────────────────────────────────────────────────────────

type CValue = number | string;
type VarMap  = Map<string, { type: string; value: CValue }>;

// ── Tokenizer ─────────────────────────────────────────────────────────────────

const TK = {
    NUM: 'NUM', STR: 'STR', CHAR: 'CHAR', ID: 'ID',
    PLUS:'+', MINUS:'-', STAR:'*', SLASH:'/', MOD:'%',
    EQ:'==', NEQ:'!=', LT:'<', GT:'>', LTE:'<=', GTE:'>=',
    AND:'&&', OR:'||', NOT:'!',
    ASSIGN:'=', PLUSEQ:'+=', MINUSEQ:'-=', STAREQ:'*=', SLASHEQ:'/=',
    LPAREN:'(', RPAREN:')', LBRACE:'{', RBRACE:'}', SEMI:';', COMMA:',',
    KW: 'KW', EOF:'EOF',
} as const;

const KEYWORDS = new Set([
    'int','float','char','void','return',
    'if','else','while','for','break','continue',
    'printf','scanf','string',
]);

type Token = { type: string; value: string | number; line: number };

function tokenize(src: string): Token[] {
    // Remove comentários
    src = src.replace(/\/\/[^\n]*/g, '');
    src = src.replace(/\/\*[\s\S]*?\*\//g, '');

    const tokens: Token[] = [];
    let i = 0, line = 1;

    while (i < src.length) {
        const ch = src[i];

        if (ch === '\n') { line++; i++; continue; }
        if (/\s/.test(ch)) { i++; continue; }

        // String literal
        if (ch === '"') {
            let s = '';
            i++;
            while (i < src.length && src[i] !== '"') {
                if (src[i] === '\\' && i+1 < src.length) {
                    const e = src[i+1];
                    s += e === 'n' ? '\n' : e === 't' ? '\t' : e;
                    i += 2;
                } else { s += src[i++]; }
            }
            i++; // closing "
            tokens.push({ type: TK.STR, value: s, line });
            continue;
        }

        // Char literal
        if (ch === "'") {
            i++;
            let c = src[i];
            if (c === '\\') { c = src[i+1] === 'n' ? '\n' : src[i+1]; i++; }
            i += 2; // char + closing '
            tokens.push({ type: TK.CHAR, value: c, line });
            continue;
        }

        // Numbers
        if (/\d/.test(ch) || (ch === '.' && /\d/.test(src[i+1]||''))) {
            let n = '';
            while (i < src.length && /[\d.]/.test(src[i])) n += src[i++];
            tokens.push({ type: TK.NUM, value: parseFloat(n), line });
            continue;
        }

        // Identifiers / keywords
        if (/[a-zA-Z_]/.test(ch)) {
            let id = '';
            while (i < src.length && /\w/.test(src[i])) id += src[i++];
            tokens.push({ type: KEYWORDS.has(id) ? TK.KW : TK.ID, value: id, line });
            continue;
        }

        // Two-char operators
        const two = src.slice(i, i+2);
        const twoMap: Record<string,string> = {
            '==': TK.EQ, '!=': TK.NEQ, '<=': TK.LTE, '>=': TK.GTE,
            '&&': TK.AND, '||': TK.OR, '+=': TK.PLUSEQ, '-=': TK.MINUSEQ,
            '*=': TK.STAREQ, '/=': TK.SLASHEQ,
            '++': 'INC', '--': 'DEC',
        };
        if (twoMap[two]) { tokens.push({ type: twoMap[two], value: two, line }); i += 2; continue; }

        // Single-char operators
        const oneMap: Record<string,string> = {
            '+': TK.PLUS, '-': TK.MINUS, '*': TK.STAR, '/': TK.SLASH,
            '%': TK.MOD,  '<': TK.LT,   '>': TK.GT,   '=': TK.ASSIGN,
            '!': TK.NOT,  '(': TK.LPAREN,')':`${TK.RPAREN}`, '{': TK.LBRACE,
            '}': TK.RBRACE, ';': TK.SEMI, ',': TK.COMMA,
        };
        if (oneMap[ch]) { tokens.push({ type: oneMap[ch], value: ch, line }); i++; continue; }

        i++; // skip unknown
    }

    tokens.push({ type: TK.EOF, value: '', line });
    return tokens;
}

// ── Parser + Interpreter (recursive-descent) ─────────────────────────────────

class Interpreter {
    private tokens: Token[];
    private pos    = 0;
    output  = '';
    errors: string[] = [];
    private vars: VarMap   = new Map();
    private scanfQueue: CValue[] = [];
    private breakFlag    = false;
    private continueFlag = false;
    private returnFlag   = false;
    private returnVal: CValue = 0;

    // Funções definidas pelo usuário: nome → { params, body tokens }
    private functions: Map<string, { params: string[]; bodyStart: number }> = new Map();

    constructor(tokens: Token[], scanfInputs: CValue[] = []) {
        this.tokens    = tokens;
        this.scanfQueue = [...scanfInputs];
    }

    // ── Token helpers ─────────────────────────────────────────────────────────
    private peek(offset = 0): Token { return this.tokens[Math.min(this.pos + offset, this.tokens.length-1)]; }
    private advance(): Token        { return this.tokens[this.pos++]; }
    private check(type: string, val?: string): boolean {
        const t = this.peek();
        return t.type === type && (val === undefined || t.value === val);
    }
    private expect(type: string, val?: string): Token {
        const t = this.advance();
        if (t.type !== type || (val !== undefined && t.value !== val))
            this.error(`Esperado '${val ?? type}' na linha ${t.line}, obteve '${t.value}'`);
        return t;
    }
    private error(msg: string): never { throw new Error(msg); }

    // ── Entry point ───────────────────────────────────────────────────────────
    run() {
        try {
            // Primeiro passo: registrar funções sem executar
            this.scanFunctions();
            // Segundo passo: executar main()
            if (!this.functions.has('main')) this.error('Função main() não encontrada.');
            this.callFunction('main', []);
        } catch (e: any) {
            this.errors.push(e.message);
        }
    }

    // ── Registra funções declaradas no código ─────────────────────────────────
    private scanFunctions() {
        let i = 0;
        while (i < this.tokens.length) {
            const t = this.tokens[i];
            // Procura padrão: (KW|ID) ID ( ... ) {
            const isType = (t.type === TK.KW && ['int','float','char','void','string'].includes(t.value as string)) || t.type === TK.ID;
            if (isType && this.tokens[i+1]?.type === TK.ID && this.tokens[i+2]?.value === '(') {
                const fname = this.tokens[i+1].value as string;
                const params: string[] = [];
                let j = i+3;
                // Coleta parâmetros simples: tipo nome, tipo nome
                while (j < this.tokens.length && this.tokens[j].value !== ')') {
                    if (this.tokens[j].type === TK.ID || this.tokens[j].type === TK.KW) {
                        const next = this.tokens[j+1];
                        if (next?.type === TK.ID) { params.push(next.value as string); j++; }
                    }
                    j++;
                }
                // j agora em ')'; avança até '{'
                while (j < this.tokens.length && this.tokens[j].value !== '{') j++;
                if (this.tokens[j]?.value === '{') {
                    this.functions.set(fname, { params, bodyStart: j });
                }
            }
            i++;
        }
    }

    // ── Chama uma função ──────────────────────────────────────────────────────
    private callFunction(name: string, argVals: CValue[]): CValue {
        const fn = this.functions.get(name);
        if (!fn) this.error(`Função '${name}' não definida.`);

        const savedPos  = this.pos;
        const savedVars = new Map(this.vars);
        const savedRet  = this.returnFlag;
        this.returnFlag = false;
        this.returnVal  = 0;

        // Injeta parâmetros como variáveis locais
        fn.params.forEach((p, idx) => {
            this.vars.set(p, { type: 'int', value: argVals[idx] ?? 0 });
        });

        this.pos = fn.bodyStart;
        this.parseBlock();

        const retVal = this.returnVal;
        this.pos        = savedPos;
        this.vars       = savedVars;
        this.returnFlag = savedRet;
        return retVal;
    }

    // ── Bloco { stmts } ───────────────────────────────────────────────────────
    private parseBlock() {
        this.expect(TK.LBRACE);
        while (!this.check(TK.RBRACE) && !this.check(TK.EOF)) {
            this.parseStatement();
            if (this.breakFlag || this.continueFlag || this.returnFlag) {
                // Saída antecipada: pula os tokens restantes até o } fechando
                // deste bloco (respeitando blocos aninhados)
                let depth = 1;
                while (depth > 0 && !this.check(TK.EOF)) {
                    const tk = this.advance();
                    if (tk.type === TK.LBRACE) depth++;
                    else if (tk.type === TK.RBRACE) depth--;
                }
                return; // } já consumido pelo loop acima
            }
        }
        this.expect(TK.RBRACE);
    }

    // Aceita tanto { bloco } quanto statement único sem chaves (if/while/for)
    private parseBody() {
        if (this.check(TK.LBRACE)) {
            this.parseBlock();
        } else {
            this.parseStatement();
        }
    }

    // Pula { bloco } ou statement único sem executar
    private skipBody() {
        if (this.check(TK.LBRACE)) {
            this.skipBlock();
        } else {
            // Pula um statement: avança até ';' respeitando parênteses aninhados
            let depth = 0;
            while (!this.check(TK.EOF)) {
                const t = this.peek();
                if (t.type === TK.LPAREN) { depth++; this.advance(); }
                else if (t.type === TK.RPAREN) { depth--; this.advance(); }
                else if (t.type === TK.SEMI && depth === 0) { this.advance(); break; }
                else if (t.type === TK.LBRACE && depth === 0) { this.skipBlock(); break; }
                else { this.advance(); }
            }
        }
    }

    // ── Statement dispatcher ──────────────────────────────────────────────────
    private parseStatement() {
        const t = this.peek();

        // Declaração de variável: int x = 5;
        if (t.type === TK.KW && ['int','float','char','string'].includes(t.value as string)) {
            this.parseVarDecl(); return;
        }
        // return
        if (t.type === TK.KW && t.value === 'return') {
            this.advance();
            this.returnVal  = this.check(TK.SEMI) ? 0 : this.parseExpr();
            this.expect(TK.SEMI);
            this.returnFlag = true;
            return;
        }
        // if
        if (t.type === TK.KW && t.value === 'if') { this.parseIf(); return; }
        // while
        if (t.type === TK.KW && t.value === 'while') { this.parseWhile(); return; }
        // for
        if (t.type === TK.KW && t.value === 'for') { this.parseFor(); return; }
        // break / continue
        if (t.type === TK.KW && t.value === 'break')    { this.advance(); this.expect(TK.SEMI); this.breakFlag = true; return; }
        if (t.type === TK.KW && t.value === 'continue') { this.advance(); this.expect(TK.SEMI); this.continueFlag = true; return; }
        // printf
        if (t.type === TK.KW && t.value === 'printf') { this.parsePrintf(); return; }
        // scanf
        if (t.type === TK.KW && t.value === 'scanf') { this.parseScanf(); return; }
        // Bloco solto
        if (t.type === TK.LBRACE) { this.parseBlock(); return; }
        // Expressão / atribuição
        this.parseExprStatement();
    }

    // ── Declaração de variável ────────────────────────────────────────────────
    private parseVarDecl() {
        const typeT = this.advance();
        const type  = typeT.value as string;

        do {
            const name = this.expect(TK.ID).value as string;
            let value: CValue = type === 'float' ? 0.0 : type === 'char' ? '\0' : type === 'string' ? '' : 0;
            if (this.check(TK.ASSIGN)) {
                this.advance();
                value = this.parseExpr();
            }
            this.vars.set(name, { type, value });
        } while (this.check(TK.COMMA) && this.advance());

        this.expect(TK.SEMI);
    }

    // ── if / else if / else ───────────────────────────────────────────────────
    private parseIf() {
        this.expect(TK.KW, 'if');
        this.expect(TK.LPAREN);
        const cond = this.parseExpr();
        this.expect(TK.RPAREN);

        if (this.isTruthy(cond)) {
            this.parseBody();
            this.skipElseChain();
        } else {
            this.skipBody();
            // else if / else
            while (this.check(TK.KW, 'else')) {
                this.advance();
                if (this.check(TK.KW, 'if')) {
                    this.advance();
                    this.expect(TK.LPAREN);
                    const c2 = this.parseExpr();
                    this.expect(TK.RPAREN);
                    if (this.isTruthy(c2)) {
                        this.parseBody();
                        this.skipElseChain();
                        return;
                    } else { this.skipBody(); }
                } else {
                    this.parseBody();
                    return;
                }
            }
        }
    }

    private skipElseChain() {
        while (this.check(TK.KW, 'else')) {
            this.advance();
            if (this.check(TK.KW, 'if')) { this.advance(); this.expect(TK.LPAREN); this.skipExpr(); this.expect(TK.RPAREN); }
            this.skipBody();
        }
    }

    private skipBlock() {
        this.expect(TK.LBRACE);
        let depth = 1;
        while (depth > 0 && !this.check(TK.EOF)) {
            const t = this.advance();
            if (t.type === TK.LBRACE) depth++;
            else if (t.type === TK.RBRACE) depth--;
        }
    }

    private skipExpr() {
        let depth = 0;
        while (!this.check(TK.EOF)) {
            const t = this.peek();
            if (t.type === TK.LPAREN) { depth++; this.advance(); }
            else if (t.type === TK.RPAREN) {
                if (depth === 0) break;
                depth--; this.advance();
            } else if ((t.type === TK.SEMI || t.type === TK.COMMA) && depth === 0) break;
            else this.advance();
        }
    }

    // ── while ────────────────────────────────────────────────────────────────
    private parseWhile() {
        this.expect(TK.KW, 'while');
        const condStart = this.pos;
        this.expect(TK.LPAREN);

        let guard = 0;
        while (true) {
            if (++guard > 100_000) this.error('Loop infinito detectado (> 100.000 iterações).');
            const cond = this.parseExpr();
            this.expect(TK.RPAREN);

            if (!this.isTruthy(cond)) { this.skipBody(); break; }

            this.parseBody();

            if (this.breakFlag)    { this.breakFlag = false; break; }
            if (this.returnFlag)   break;
            this.continueFlag = false;
            this.pos = condStart + 1; // volta ao início da condição (depois do '(')
        }
    }

    // ── for ──────────────────────────────────────────────────────────────────
    private parseFor() {
        this.expect(TK.KW, 'for');
        this.expect(TK.LPAREN);

        // Init
        if (!this.check(TK.SEMI)) {
            if (this.peek().type === TK.KW && ['int','float','char','string'].includes(this.peek().value as string))
                this.parseVarDecl();
            else
                this.parseExprStatement();
        } else this.expect(TK.SEMI);

        const condPos = this.pos;
        let guard = 0;

        while (true) {
            if (++guard > 100_000) this.error('Loop infinito detectado (> 100.000 iterações).');

            // Condição
            let cond: CValue = 1;
            if (!this.check(TK.SEMI)) cond = this.parseExpr();
            this.expect(TK.SEMI);

            const incrPos = this.pos;

            // Pula incremento para encontrar o body
            this.skipExpr();
            this.expect(TK.RPAREN);

            if (!this.isTruthy(cond)) { this.skipBody(); break; }

            this.parseBody();

            if (this.breakFlag) { this.breakFlag = false; break; }
            if (this.returnFlag) break;
            this.continueFlag = false;

            // Executa incremento
            this.pos = incrPos;
            if (!this.check(TK.RPAREN)) this.parseExpr();

            // Volta à condição
            this.pos = condPos;
        }
    }

    // ── printf ───────────────────────────────────────────────────────────────
    private parsePrintf() {
        this.expect(TK.KW, 'printf');
        this.expect(TK.LPAREN);

        const fmt = this.expect(TK.STR).value as string;
        const args: CValue[] = [];
        while (this.check(TK.COMMA)) {
            this.advance();
            args.push(this.parseExpr());
        }
        this.expect(TK.RPAREN);
        this.expect(TK.SEMI);

        let ai = 0;
        const out = fmt.replace(/%[dfsco%]/g, (spec) => {
            if (spec === '%%') return '%';
            const v = args[ai++];
            if (spec === '%d') return String(Math.trunc(Number(v)));
            if (spec === '%f') return Number(v).toFixed(6);
            if (spec === '%s') return String(v);
            if (spec === '%c') return typeof v === 'string' ? v[0] ?? '' : String.fromCharCode(Number(v));
            if (spec === '%o') return Number(v).toString(8);
            return spec;
        });
        this.output += out;
    }

    // ── scanf (simulado) ──────────────────────────────────────────────────────
    private parseScanf() {
        this.expect(TK.KW, 'scanf');
        this.expect(TK.LPAREN);
        this.expect(TK.STR); // formato — ignorado
        while (this.check(TK.COMMA)) {
            this.advance();
            // Espera &varName
            if (this.check(TK.AND as any) || (this.peek().value === '&')) this.advance();
            const name = this.expect(TK.ID).value as string;
            const val  = this.scanfQueue.shift() ?? 0;
            if (this.vars.has(name)) this.vars.get(name)!.value = val;
        }
        this.expect(TK.RPAREN);
        this.expect(TK.SEMI);
    }

    // ── Expressão-statement (atribuição, chamada de função etc.) ─────────────
    private parseExprStatement() {
        this.parseExpr();
        this.expect(TK.SEMI);
    }

    // ── Expressão (operadores binários com precedência) ───────────────────────
    private parseExpr(): CValue { return this.parseAssign(); }

    private parseAssign(): CValue {
        // Verifica se é atribuição: ID = expr
        if (this.peek().type === TK.ID) {
            const name = this.peek().value as string;
            const next = this.peek(1);
            const assignOps = [TK.ASSIGN, TK.PLUSEQ, TK.MINUSEQ, TK.STAREQ, TK.SLASHEQ];
            if (assignOps.includes(next.type as any)) {
                this.advance(); // consume ID
                const op = this.advance().type;
                const rhs = this.parseAssign();
                if (!this.vars.has(name)) this.error(`Variável '${name}' não declarada.`);
                const current = this.vars.get(name)!.value;
                let newVal: CValue;
                if (op === TK.ASSIGN)   newVal = rhs;
                else if (op === TK.PLUSEQ)  newVal = (current as number) + (rhs as number);
                else if (op === TK.MINUSEQ) newVal = (current as number) - (rhs as number);
                else if (op === TK.STAREQ)  newVal = (current as number) * (rhs as number);
                else newVal = (rhs as number) === 0 ? (this.error('Divisão por zero'), 0) : (current as number) / (rhs as number);
                this.vars.get(name)!.value = newVal;
                return newVal;
            }
        }
        return this.parseOr();
    }

    private parseOr(): CValue {
        let left = this.parseAnd();
        while (this.check(TK.OR)) { this.advance(); const r = this.parseAnd(); left = (this.isTruthy(left) || this.isTruthy(r)) ? 1 : 0; }
        return left;
    }
    private parseAnd(): CValue {
        let left = this.parseEquality();
        while (this.check(TK.AND)) { this.advance(); const r = this.parseEquality(); left = (this.isTruthy(left) && this.isTruthy(r)) ? 1 : 0; }
        return left;
    }
    private parseEquality(): CValue {
        let left = this.parseRelational();
        while (this.check(TK.EQ) || this.check(TK.NEQ)) {
            const op = this.advance().type;
            const r = this.parseRelational();
            left = op === TK.EQ ? (left == r ? 1 : 0) : (left != r ? 1 : 0);
        }
        return left;
    }
    private parseRelational(): CValue {
        let left = this.parseAddSub();
        while ([TK.LT,TK.GT,TK.LTE,TK.GTE].includes(this.peek().type as any)) {
            const op = this.advance().type;
            const r = this.parseAddSub();
            if (op === TK.LT)  left = (left as number) <  (r as number) ? 1 : 0;
            if (op === TK.GT)  left = (left as number) >  (r as number) ? 1 : 0;
            if (op === TK.LTE) left = (left as number) <= (r as number) ? 1 : 0;
            if (op === TK.GTE) left = (left as number) >= (r as number) ? 1 : 0;
        }
        return left;
    }
    private parseAddSub(): CValue {
        let left = this.parseMulDiv();
        while (this.check(TK.PLUS) || this.check(TK.MINUS)) {
            const op = this.advance().type;
            const r  = this.parseMulDiv();
            left = op === TK.PLUS
                ? (typeof left === 'string' || typeof r === 'string')
                    ? String(left) + String(r)
                    : (left as number) + (r as number)
                : (left as number) - (r as number);
        }
        return left;
    }
    private parseMulDiv(): CValue {
        let left = this.parseUnary();
        while (this.check(TK.STAR) || this.check(TK.SLASH) || this.check(TK.MOD)) {
            const op = this.advance().type;
            const r  = this.parseUnary();
            if (op === TK.STAR)  left = (left as number) * (r as number);
            else if (op === TK.MOD)  left = (left as number) % (r as number);
            else {
                if ((r as number) === 0) this.error('Divisão por zero.');
                left = (left as number) / (r as number);
            }
        }
        return left;
    }
    private parseUnary(): CValue {
        // Prefix ++/--
        if (this.check('INC') || this.check('DEC')) {
            const op  = this.advance().type;
            const name = this.expect(TK.ID).value as string;
            if (!this.vars.has(name)) this.error(`Variável '${name}' não declarada.`);
            const cur = this.vars.get(name)!.value as number;
            const nv  = op === 'INC' ? cur + 1 : cur - 1;
            this.vars.get(name)!.value = nv;
            return nv;
        }
        if (this.check(TK.MINUS)) { this.advance(); return -(this.parseUnary() as number); }
        if (this.check(TK.NOT))   { this.advance(); return this.isTruthy(this.parseUnary()) ? 0 : 1; }
        return this.parsePrimary();
    }

    // ── Primary ───────────────────────────────────────────────────────────────
    private parsePrimary(): CValue {
        const t = this.peek();

        if (t.type === TK.NUM)  { this.advance(); return t.value as number; }
        if (t.type === TK.STR)  { this.advance(); return t.value as string; }
        if (t.type === TK.CHAR) { this.advance(); return (t.value as string).charCodeAt(0); }

        // Parênteses
        if (t.type === TK.LPAREN) {
            this.advance();
            const v = this.parseExpr();
            this.expect(TK.RPAREN);
            return v;
        }

        // Chamada de função ou variável
        if (t.type === TK.ID || t.type === TK.KW) {
            const name = t.value as string;
            this.advance();
            // Chamada
            if (this.check(TK.LPAREN)) {
                this.expect(TK.LPAREN);
                const args: CValue[] = [];
                while (!this.check(TK.RPAREN) && !this.check(TK.EOF)) {
                    args.push(this.parseExpr());
                    if (this.check(TK.COMMA)) this.advance();
                }
                this.expect(TK.RPAREN);
                // Funções built-in extras
                if (name === 'abs')   return Math.abs(args[0] as number);
                if (name === 'sqrt')  return Math.sqrt(args[0] as number);
                if (name === 'pow')   return Math.pow(args[0] as number, args[1] as number);
                if (name === 'rand')  return Math.floor(Math.random() * 32768);
                return this.callFunction(name, args);
            }
            // Leitura de variável (com postfix ++ / --)
            if (!this.vars.has(name)) this.error(`Variável '${name}' não declarada (linha ${t.line}).`);
            const varVal = this.vars.get(name)!.value;
            if (this.check('INC') || this.check('DEC')) {
                const op = this.advance().type;
                const cur = varVal as number;
                this.vars.get(name)!.value = op === 'INC' ? cur + 1 : cur - 1;
                return cur; // retorna valor ANTES do incremento (semântica postfix)
            }
            return varVal;
        }

        this.advance(); // skip unexpected
        return 0;
    }

    private isTruthy(v: CValue): boolean { return typeof v === 'string' ? v.length > 0 : v !== 0; }
}

// ── API pública ───────────────────────────────────────────────────────────────

export const CCompiler = {
    /**
     * Compila e executa o código C fornecido.
     * @param source  Código-fonte C
     * @param inputs  Valores fornecidos para scanf() em ordem
     */
    run(source: string, inputs: CValue[] = []): CompileResult {
        try {
            const tokens     = tokenize(source);
            const interp     = new Interpreter(tokens, inputs);
            interp.run();
            return {
                output:  interp.output,
                errors:  interp.errors,
                success: interp.errors.length === 0,
            };
        } catch (e: any) {
            return { output: '', errors: [e.message], success: false };
        }
    },
};