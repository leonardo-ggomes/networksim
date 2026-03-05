/**
 * Missions.ts — HackOS
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROGRESSÃO PEDAGÓGICA — 16 missões em 5 fases
 *
 * FASE 0 — ONBOARDING
 *   M00  Buscar o dispositivo com o professor           (collided)
 *   M01  Ligar o terminal pela primeira vez             (terminal:opened)
 *
 * FASE 1 — SISTEMA DE ARQUIVOS
 *   M02  ls + cd + pwd — navegar pelo sistema           (terminal:pwd em /home/)
 *   M03  cat — ler o briefing secreto                   (terminal:cat briefing.txt)
 *   M04  nano — criar diário de bordo                   (terminal:nano *.txt)
 *   M05  mkdir + rm — organizar e limpar                (terminal:mkdir)
 *
 * FASE 2 — PROCESSOS & SEGURANÇA
 *   M06  top/ps — identificar o malware                 (terminal:ls proxy)
 *   M07  kill -9 — eliminar o malware                   (remove_pid PID 4096)
 *
 * FASE 3 — REDE
 *   M08  ifconfig + ping — reconhecimento de rede       (terminal:ping)
 *   M09  ssh — conexão remota ao servidor               (terminal:ssh)
 *
 * FASE 4 — PROGRAMAÇÃO EM C
 *   M10  Olá, Mundo!                                    (c:output)
 *   M11  Variáveis e aritmética                         (c:output)
 *   M12  Condicional if/else                            (c:output)
 *   M13  Loop for: 1 a 5                                (c:output)
 *   M14  Função customizada mult(4,5)                   (c:output)
 *   M15  Fibonacci recursivo — boss                     (c:output)
 *
 * FASE 5 — ENCERRAMENTO
 *   M16  Apresentação final no auditório                (collided)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Eventos que ACTIONS.TS deve emitir (ver patch terminal-events):
 *   terminal:opened   — boot completo
 *   terminal:pwd      — detail: { dir }
 *   terminal:cat      — detail: { file, dir }
 *   terminal:nano     — detail: { file, action: "created"|"updated", dir }
 *   terminal:ls       — detail: { dir }
 *   terminal:mkdir    — detail: { dir, path }
 *   terminal:ping     — detail: { host }
 *   terminal:ssh      — detail: { address }
 *   remove_pid        — detail: { processes, isCollided }  (já existia)
 *   c:output          — detail: { output, source }          (já existia)
 *   collided          — detail: { collided }                (já existia)
 */

import { Scene, Vector3 }                  from "three";
import Mission                             from "./Mission";
import Loading                             from "./Loading";
import { infoPlayer }                      from "./InfoPlayer";
import { eventEmitter, showInstruction }   from "./Actions";
import elementos                           from "./Actions";

declare global { interface Window { HUD?: any } }

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type Reward  = { money?: number; health?: number; energy?: number };
export type Penalty = { energy?: number };

export type MissionDef = {
    id:          string;
    title:       string;
    instruction: string;
    position:    Vector3;
    radius?:     number;
    reward:      Reward;
    penalty?:    Penalty;
    helper?:     boolean;
    listenTo?:   string;
    onStart?:    () => void;
    check?:      (event: CustomEvent) => boolean;
    onComplete?: () => void;
};

// ── Helpers de validação ──────────────────────────────────────────────────────

/** Normaliza saída do compilador C */
function norm(s: string): string {
    return s.replace(/\r/g, '').trim().replace(/\s+/g, ' ');
}

/** Verifica se a saída contém todas as linhas esperadas em ordem */
function hasLines(output: string, expected: string[]): boolean {
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    let ei = 0;
    for (const line of lines) {
        if (line === expected[ei]) ei++;
        if (ei === expected.length) return true;
    }
    return false;
}

// ── Posições na cena ──────────────────────────────────────────────────────────
// Ajuste os vetores para o layout real do mapa.

const POS = {
    professor: new Vector3(-6, 0, 25),   // NPC professor
    sala:      new Vector3(   0,    0,  10),   // zona de trabalho (terminal / C)
    servidor:  new Vector3(  -8,    1,  22),   // sala do servidor remoto
    auditorio: new Vector3(   0,    0,  -5),   // palco de encerramento
};

// ── Textos de arquivos injetados pelas missões ────────────────────────────────

const BRIEFING = `=== BRIEFING CONFIDENCIAL ===
Agente, voce foi selecionado para o Programa HackOS.
Sua missao: dominar o terminal Linux e a linguagem C
antes que o sistema seja completamente comprometido.

Fases:
  1. Sistema de arquivos (ls cd pwd cat nano mkdir rm)
  2. Processos e seguranca (top ps kill)
  3. Rede (ifconfig ping ssh)
  4. Programacao em C (7 desafios)

Boa sorte. — Prof. Sistema`;

// ── buildMissions ─────────────────────────────────────────────────────────────

export function buildMissions(): MissionDef[] {
    return [

        // ══════════════════════════════════════════════════════════════════════
        // FASE 0 — ONBOARDING
        // ══════════════════════════════════════════════════════════════════════

        {
            id:    'get-device',
            title: '🎒 Busque seu dispositivo',
            instruction: 'Aproxime-se do professor para receber seu notebook HackOS e começar o evento.',
            position: POS.professor,
            radius:   2.5,
            reward:   { money: 100, energy: 50 },
            helper:   true,
            listenTo: 'collided',
            onStart: () => {
                showInstruction(
                    '🎒 Bem-vindo ao HackOS',
                    'Voce chegou ao evento de tecnologia.\n' +
                    'O professor esta com seu notebook.\n\n' +
                    'Siga o marcador no mapa e\n' +
                    'aproxime-se para receber o dispositivo.'
                );
                window.HUD?.notify('📍 Encontre o professor para começar.', 'info');
            },
            check: (e) => (e.detail as any).collided === true,
            onComplete: () => {
                infoPlayer.hasTerminal = true;
                showInstruction(
                    '✅ Notebook recebido!',
                    'Voce ganhou um notebook HackOS.\n\n' +
                    'Pressione T para ligar o terminal\n' +
                    'e iniciar sua jornada de hacker.'
                );
                window.HUD?.notify('💻 Terminal desbloqueado! Pressione T.', 'success');
            },
        },

        {
            id:    'first-boot',
            title: '⚡ Ligue o terminal',
            instruction: 'Pressione T para abrir o terminal e aguarde o boot do HackOS completar.',
            position: POS.sala,
            radius:   30,
            reward:   { money: 150, energy: 10 },
            helper:   true,
            listenTo: 'terminal:opened',
            onStart: () => {
                showInstruction(
                    '⚡ Primeiro Boot',
                    'Pressione T para ligar o terminal.\n\n' +
                    'Observe a sequencia de inicializacao:\n' +
                    'isso e o boot do sistema operacional.\n\n' +
                    'Depois tente: help'
                );
                window.HUD?.notify('Pressione T para ligar o terminal.', 'info');
            },
            check: (_e) => true,
            onComplete: () => {
                showInstruction(
                    '✅ HackOS Online!',
                    'Terminal inicializado com sucesso.\n\n' +
                    'Dica: always type help to see\n' +
                    'all available commands.'
                );
            },
        },

        // ══════════════════════════════════════════════════════════════════════
        // FASE 1 — SISTEMA DE ARQUIVOS
        // ══════════════════════════════════════════════════════════════════════

        {
            id:    'navigate-fs',
            title: '📂 Navegue pelo sistema',
            instruction: 'No terminal: use ls para listar arquivos, cd home para entrar na pasta, pwd para ver onde está.',
            position: POS.sala,
            radius:   30,
            reward:   { money: 200, energy: 5 },
            helper:   false,
            listenTo: 'terminal:pwd',
            onStart: () => {
                // Injeta arquivos para as próximas missões
                elementos.setFilesInMission('/home/', 'briefing.txt', BRIEFING);
                elementos.setFilesInMission('/home/', 'leiame.txt',
                    'Bem-vindo ao sistema HackOS!\n' +
                    'Use cat briefing.txt para ler o briefing.\n' +
                    'Digite help para ver todos os comandos.'
                );
                showInstruction(
                    '📂 Sistema de Arquivos',
                    'Tres comandos essenciais:\n\n' +
                    '  ls       → lista arquivos e pastas\n' +
                    '  cd home  → entra em /home/\n' +
                    '  pwd      → mostra onde voce esta\n\n' +
                    'Objetivo: execute pwd dentro de /home/'
                );
            },
            check: (e) => {
                const { dir } = (e.detail ?? {}) as any;
                return typeof dir === 'string' && dir.includes('home');
            },
            onComplete: () => {
                showInstruction(
                    '✅ Navegação dominada!',
                    'ls, cd e pwd sao os comandos\n' +
                    'mais usados no dia a dia Linux.\n\n' +
                    'Agora leia o briefing secreto.'
                );
            },
        },

        {
            id:    'read-briefing',
            title: '📄 Leia o briefing secreto',
            instruction: 'Dentro de /home/, execute: cat briefing.txt',
            position: POS.sala,
            radius:   30,
            reward:   { money: 200 },
            helper:   false,
            listenTo: 'terminal:cat',
            onStart: () => {
                showInstruction(
                    '📄 Leitura de Arquivo',
                    'O arquivo briefing.txt foi plantado\n' +
                    'em /home/ pelo professor.\n\n' +
                    'Acesse-o com:\n' +
                    '  cat briefing.txt\n\n' +
                    'cat exibe o conteudo completo\n' +
                    'de qualquer arquivo de texto.'
                );
            },
            check: (e) => (e.detail as any).file === 'briefing.txt',
            onComplete: () => {
                showInstruction(
                    '✅ Briefing lido!',
                    'cat e essencial para ler logs,\n' +
                    'configs e codigo no terminal.\n\n' +
                    'Agora crie seu proprio arquivo.'
                );
            },
        },

        {
            id:    'create-diary',
            title: '✏️ Crie seu diário de bordo',
            instruction: 'Crie um arquivo com nano: nano diario.txt "Missao iniciada"',
            position: POS.sala,
            radius:   30,
            reward:   { money: 250, health: 5 },
            helper:   false,
            listenTo: 'terminal:nano',
            onStart: () => {
                showInstruction(
                    '✏️ Criando Arquivos',
                    'nano cria e edita arquivos.\n\n' +
                    'Sintaxe:\n' +
                    '  nano nome.ext "conteudo"\n\n' +
                    'Execute:\n' +
                    '  nano diario.txt "Missao iniciada"\n\n' +
                    'Extensoes aceitas: .txt .js .py'
                );
            },
            check: (e) => {
                const { file, action } = (e.detail ?? {}) as any;
                return typeof file === 'string'
                    && file.match(/\.(txt|js|py)$/)
                    && action === 'created';
            },
            onComplete: () => {
                showInstruction(
                    '✅ Arquivo criado!',
                    'Use cat diario.txt para reler.\n' +
                    'nano nome.txt "novo texto"\n' +
                    'sobrescreve o conteudo existente.'
                );
            },
        },

        {
            id:    'organize-dirs',
            title: '📁 Organize com mkdir',
            instruction: 'Crie uma pasta para seus projetos: mkdir projetos',
            position: POS.sala,
            radius:   30,
            reward:   { money: 200 },
            helper:   false,
            listenTo: 'terminal:mkdir',
            onStart: () => {
                showInstruction(
                    '📁 Diretórios',
                    'mkdir cria novas pastas.\n\n' +
                    'Execute: mkdir projetos\n\n' +
                    'Depois verifique:\n' +
                    '  ls        → voce vera "projetos"\n' +
                    '  cd projetos → entra na pasta\n' +
                    '  pwd         → confirma o caminho'
                );
            },
            check: (e) => typeof (e.detail as any).dir === 'string',
            onComplete: () => {
                showInstruction(
                    '✅ Pasta criada!',
                    'Organize seus projetos em pastas.\n' +
                    'Use rm arquivo.txt para remover\n' +
                    'arquivos que nao precisa mais.'
                );
            },
        },

        // ══════════════════════════════════════════════════════════════════════
        // FASE 2 — PROCESSOS & SEGURANÇA
        // ══════════════════════════════════════════════════════════════════════

        {
            id:    'find-malware',
            title: '🔍 Identifique o processo suspeito',
            instruction: 'Abra o terminal e use top ou ps aux para encontrar o processo consumindo mais CPU.',
            position: POS.professor,
            radius:   3,
            reward:   { money: 250 },
            helper:   true,
            listenTo: 'terminal:ls',   // ls é o evento mais genérico — confirma que o terminal foi aberto
            onStart: () => {
                elementos.setProcesses('malware.exe', 4096, 849.9, 91.2);
                setTimeout(() => {
                    showInstruction(
                        '🔍 Ameaça Detectada',
                        'O sistema esta lento!\n\n' +
                        'Abra o terminal (T) e use:\n' +
                        '  top      → monitor em tempo real\n' +
                        '  ps aux   → lista todos os processos\n\n' +
                        'Encontre o processo com maior %CPU\n' +
                        'e anote o PID para eliminá-lo.'
                    );
                }, 400);
                window.HUD?.notify('⚠️ Processo malicioso detectado no sistema!', 'error');
            },
            check: (_e) => true,
            onComplete: () => {
                showInstruction(
                    '🔍 Processo identificado!',
                    'malware.exe — PID 4096 — 91% CPU\n\n' +
                    'Agora encerre-o com:\n' +
                    '  kill -9 4096'
                );
            },
        },

        {
            id:    'kill-malware',
            title: '🦠 Elimine o malware',
            instruction: 'No terminal, encerre o processo malicioso: kill -9 4096',
            position: POS.professor,
            radius:   3,
            reward:   { money: 500, health: 20, energy: 15 },
            helper:   true,
            listenTo: 'remove_pid',
            onStart: () => {
                setTimeout(() => showInstruction(
                    '🦠 Elimine o Malware',
                    'malware.exe (PID 4096) esta consumindo\n' +
                    '91% do CPU — o sistema vai travar!\n\n' +
                    'Comando:\n' +
                    '  kill -9 4096\n\n' +
                    '-9 e o sinal SIGKILL:\n' +
                    'encerra o processo imediatamente,\n' +
                    'sem chance de ignorar.'
                ), 300);
                window.HUD?.notify('🦠 Execute: kill -9 4096', 'error');
            },
            check: (e) => {
                const { processes, isCollided } = e.detail as any;
                return isCollided
                    && (processes as any[]).findIndex(p => p.pid === 4096) === -1;
            },
            onComplete: () => {
                showInstruction(
                    '✅ Sistema limpo!',
                    'malware.exe foi encerrado.\n\n' +
                    'Lição: kill -9 [PID] encerra\n' +
                    'qualquer processo pelo seu ID.\n\n' +
                    'Use top para confirmar que sumiu.'
                );
                (window as any).__experienceAmbientLight &&
                    ((window as any).__experienceAmbientLight.intensity = 0.8);
                window.HUD?.notify('🛡️ Malware eliminado!', 'success');
            },
        },

        // ══════════════════════════════════════════════════════════════════════
        // FASE 3 — REDE
        // ══════════════════════════════════════════════════════════════════════

        {
            id:    'network-recon',
            title: '🌐 Reconhecimento de rede',
            instruction: 'Execute ifconfig para ver seu IP, depois ping 192.168.1.1 para testar a conexão.',
            position: POS.sala,
            radius:   30,
            reward:   { money: 300, energy: 10 },
            helper:   false,
            listenTo: 'terminal:ping',
            onStart: () => {
                showInstruction(
                    '🌐 Rede & Conectividade',
                    'Dois comandos essenciais:\n\n' +
                    '  ifconfig\n' +
                    '    mostra IP, mascara e gateway\n\n' +
                    '  ping 192.168.1.1\n' +
                    '    testa conexao com o roteador\n\n' +
                    'Execute ambos para completar\n' +
                    'o reconhecimento de rede.'
                );
            },
            check: (e) => typeof (e.detail as any).host === 'string',
            onComplete: () => {
                showInstruction(
                    '✅ Rede mapeada!',
                    'Voce sabe verificar configuracao\n' +
                    'de rede e testar conectividade.\n\n' +
                    'Proxima etapa: acesso remoto SSH.'
                );
            },
        },

        {
            id:    'ssh-connect',
            title: '🔐 Conecte ao servidor remoto',
            instruction: 'Aproxime-se do servidor e conecte via SSH: ssh server@2025',
            position: POS.servidor,
            radius:   3,
            reward:   { money: 600, energy: 15 },
            helper:   true,
            listenTo: 'terminal:ssh',
            onStart: () => {
                showInstruction(
                    '🔐 Acesso Remoto — SSH',
                    'SSH (Secure Shell) permite acessar\n' +
                    'maquinas remotas pelo terminal.\n\n' +
                    'Aproxime-se do servidor e execute:\n' +
                    '  ssh server@2025\n\n' +
                    'Apos conectar, ls lista os\n' +
                    'arquivos do servidor remoto.\n' +
                    'exit encerra a sessao.'
                );
                window.HUD?.notify('🔐 Aproxime-se do servidor remoto.', 'info');
            },
            check: (e) => typeof (e.detail as any).address === 'string',
            onComplete: () => {
                showInstruction(
                    '🔐 Sessão SSH ativa!',
                    'Voce esta no servidor remoto.\n\n' +
                    'Os mesmos comandos funcionam:\n' +
                    'ls, cat, nano, mkdir...\n\n' +
                    'Use exit para voltar ao local.'
                );
                window.HUD?.notify('🔐 Sessão SSH estabelecida!', 'success');
            },
        },

        // ══════════════════════════════════════════════════════════════════════
        // FASE 4 — PROGRAMAÇÃO EM C
        // Todas usam listenTo: 'c:output' — detail: { output, source }
        // ══════════════════════════════════════════════════════════════════════

        {
            id:    'c-hello',
            title: '👨‍💻 Olá, Mundo! em C',
            instruction: 'Abra o Editor C e imprima exatamente: Ola, Mundo!',
            position: POS.sala,
            radius:   30,
            reward:   { money: 300, energy: 10 },
            helper:   false,
            listenTo: 'c:output',
            onStart: () => {
                showInstruction(
                    '👨‍💻 C #1 — Olá Mundo',
                    'Abra o terminal → aba "Editor C"\n\n' +
                    '#include <stdio.h>\n\n' +
                    'int main() {\n' +
                    '    printf("Ola, Mundo!");\n' +
                    '    return 0;\n' +
                    '}\n\n' +
                    'Pressione ▶ para compilar e rodar.'
                );
            },
            check: (e) => norm((e.detail as any).output) === 'Ola, Mundo!',
            onComplete: () => {
                showInstruction(
                    '✅ Primeiro programa C!',
                    'printf() imprime texto na tela.\n' +
                    'Todo programa C comeca em main().\n' +
                    'return 0 indica sucesso.'
                );
            },
        },

        {
            id:    'c-arithmetic',
            title: '🔢 Variáveis e Aritmética',
            instruction: 'Declare dois int, some-os e imprima o resultado. Ex: a=7, b=3 → 10.',
            position: POS.sala,
            radius:   30,
            reward:   { money: 400, energy: 5 },
            helper:   false,
            listenTo: 'c:output',
            onStart: () => {
                showInstruction(
                    '🔢 C #2 — Variáveis',
                    'int a = 7;\n' +
                    'int b = 3;\n' +
                    'printf("%d", a + b);\n\n' +
                    '• int   → tipo numero inteiro\n' +
                    '• %d    → formata int no printf\n' +
                    '• Qualquer soma valida e aceita!\n\n' +
                    'A saida deve ser um numero inteiro.'
                );
            },
            check: (e) => {
                const { output, source } = e.detail as any;
                return !isNaN(parseInt(norm(output), 10))
                    && /int\s+\w+\s*=/.test(source)
                    && /\+/.test(source);
            },
            onComplete: () => {
                showInstruction(
                    '✅ Variáveis!',
                    'int, float e char sao os tipos\n' +
                    'basicos de C.\n\n' +
                    '%d → int     %f → float\n' +
                    '%c → char    %s → string'
                );
            },
        },

        {
            id:    'c-conditional',
            title: '🔀 Condicional if/else',
            instruction: 'Verifique se um número é positivo ou negativo e imprima o resultado.',
            position: POS.sala,
            radius:   30,
            reward:   { money: 500, health: 10 },
            helper:   false,
            listenTo: 'c:output',
            onStart: () => {
                showInstruction(
                    '🔀 C #3 — if / else',
                    'int n = 5;\n' +
                    'if (n > 0) {\n' +
                    '    printf("positivo");\n' +
                    '} else {\n' +
                    '    printf("negativo");\n' +
                    '}\n\n' +
                    'if/else toma decisoes em tempo\n' +
                    'de execucao com base em condicoes.'
                );
            },
            check: (e) => {
                const { output, source } = e.detail as any;
                return /\bif\b/.test(source)
                    && /\belse\b/.test(source)
                    && (output.toLowerCase().includes('positivo')
                        || output.toLowerCase().includes('negativo'));
            },
            onComplete: () => {
                showInstruction(
                    '✅ Condicionais!',
                    'if / else / else if permitem\n' +
                    'que o programa tome decisoes.\n\n' +
                    'Toda logica de negocio depende\n' +
                    'de condicionais.'
                );
            },
        },

        {
            id:    'c-loop',
            title: '🔁 Loop for: 1 a 5',
            instruction: 'Escreva um for loop que imprima os números 1, 2, 3, 4, 5 — um por linha.',
            position: POS.sala,
            radius:   30,
            reward:   { money: 600, health: 10, energy: 10 },
            helper:   false,
            listenTo: 'c:output',
            onStart: () => {
                showInstruction(
                    '🔁 C #4 — Loop for',
                    'for (int i = 1; i <= 5; i++) {\n' +
                    '    printf("%d\\n", i);\n' +
                    '}\n\n' +
                    '• i = 1   → comeca em 1\n' +
                    '• i <= 5  → para quando i > 5\n' +
                    '• i++     → incrementa 1 por vez\n' +
                    '• \\n      → quebra de linha'
                );
            },
            check: (e) => {
                const { output, source } = e.detail as any;
                return /\bfor\b/.test(source)
                    && hasLines(output, ['1','2','3','4','5']);
            },
            onComplete: () => {
                showInstruction(
                    '✅ Loop dominado!',
                    'Loops automatizam repeticoes.\n\n' +
                    'C tem tres tipos de loop:\n' +
                    '  for    → quando sabe quantas vezes\n' +
                    '  while  → enquanto condicao for true\n' +
                    '  do/while → executa ao menos 1 vez'
                );
            },
        },

        {
            id:    'c-function',
            title: '⚙️ Crie uma função',
            instruction: 'Escreva mult(a,b) que retorne a×b. Imprima mult(4,5). Esperado: 20.',
            position: POS.sala,
            radius:   30,
            reward:   { money: 800, health: 15, energy: 15 },
            helper:   false,
            listenTo: 'c:output',
            onStart: () => {
                showInstruction(
                    '⚙️ C #5 — Funções',
                    'int mult(int a, int b) {\n' +
                    '    return a * b;\n' +
                    '}\n\n' +
                    'int main() {\n' +
                    '    printf("%d", mult(4, 5));\n' +
                    '    return 0;\n' +
                    '}\n\n' +
                    'Esperado: 20'
                );
            },
            check: (e) => {
                const { output, source } = e.detail as any;
                return /int\s+\w+\s*\(/.test(source)
                    && /return/.test(source)
                    && /\w+\s*\(\s*\d+\s*,\s*\d+\s*\)/.test(source)
                    && norm(output) === '20';
            },
            onComplete: () => {
                showInstruction(
                    '🏆 Funções!',
                    'Funcoes encapsulam logica reutilizavel.\n\n' +
                    'tipo retorno  nome  (parametros)\n\n' +
                    'Sao o pilar da programacao estruturada\n' +
                    'e base para orientacao a objetos.'
                );
            },
        },

        {
            // Boss challenge — Fibonacci recursivo
            id:    'c-fibonacci',
            title: '🧠 Fibonacci Recursivo',
            instruction: 'Implemente fib(n) recursivo e imprima fib(7). Esperado: 13.',
            position: POS.sala,
            radius:   30,
            reward:   { money: 1200, health: 20, energy: 20 },
            helper:   false,
            listenTo: 'c:output',
            onStart: () => {
                showInstruction(
                    '🧠 C #6 — Recursão (Boss)',
                    'int fib(int n) {\n' +
                    '    if (n <= 1) return n;\n' +
                    '    return fib(n-1) + fib(n-2);\n' +
                    '}\n' +
                    'int main() {\n' +
                    '    printf("%d", fib(7));\n' +
                    '}\n\n' +
                    'Sequencia: 0 1 1 2 3 5 8 13...\n' +
                    'fib(7) = 13'
                );
                window.HUD?.notify('🧠 Boss Challenge: Fibonacci recursivo!', 'warn');
            },
            check: (e) => {
                const { output, source } = e.detail as any;
                return /int\s+\w+\s*\(\s*int/.test(source)       // funcao com param int
                    && /return\s+\w+\s*\(/.test(source)            // chamada recursiva
                    && /if\s*\(.*<=?\s*1/.test(source)             // caso base
                    && norm(output) === '13';
            },
            onComplete: () => {
                showInstruction(
                    '🏆 Recursão dominada!',
                    'Recursao = funcao que chama a si mesma.\n\n' +
                    'Sempre precisa de:\n' +
                    '  1. Caso base (para a recursao)\n' +
                    '  2. Chamada recursiva\n\n' +
                    'Fibonacci e o exemplo classico!'
                );
                window.HUD?.notify('🏆 Boss Fibonacci concluído!', 'success');
            },
        },

        // ══════════════════════════════════════════════════════════════════════
        // FASE 5 — ENCERRAMENTO
        // ══════════════════════════════════════════════════════════════════════

        {
            id:    'finale',
            title: '🎤 Apresentação final',
            instruction: 'Dirija-se ao auditório, sente-se em uma cadeira e assista à cerimônia de encerramento.',
            position: POS.auditorio,
            radius:   15,
            reward:   { money: 1000, health: 100, energy: 100 },
            helper:   true,
            listenTo: 'collided',
            onStart: () => {
                showInstruction(
                    '🎤 Hora da Formatura',
                    'Voce completou todos os desafios!\n\n' +
                    'Dirija-se ao auditório e\n' +
                    'sente-se para a cerimonia final.\n\n' +
                    'Parabens, Hacker!'
                );
                window.HUD?.notify('🎤 Vá ao auditório para a formatura!', 'success');
            },
            check: (e) => (e.detail as any).collided === true,
            onComplete: () => {
                showInstruction(
                    '🏆 Parabéns, Hacker!',
                    'Voce concluiu o HackOS!\n\n' +
                    '✓ Sistema de arquivos\n' +
                    '  ls  cd  pwd  cat  nano  mkdir  rm\n\n' +
                    '✓ Processos e seguranca\n' +
                    '  top  ps  kill -9\n\n' +
                    '✓ Rede\n' +
                    '  ifconfig  ping  ssh\n\n' +
                    '✓ Programacao em C\n' +
                    '  printf  int  if/else  for  funcao  recursao\n\n' +
                    'Voce esta pronto para o proximo nivel!'
                );
                window.HUD?.notify('🏆 HackOS completo! Você é um hacker!', 'success');
            },
        },
    ];
}

// ── MissionManager ────────────────────────────────────────────────────────────

export class MissionManager {

    private scene:   Scene;
    private loading: Loading;
    private defs:    MissionDef[];
    private index  = 0;
    private active?: Mission;

    currentDef?: MissionDef;

    constructor(scene: Scene, loading: Loading) {
        this.scene   = scene;
        this.loading = loading;
        this.defs    = buildMissions();
    }

    /** Inicia a sequência do zero */
    start() {
        this.index = 0;
        this.launchCurrent();
    }

    private launchCurrent() {
        if (this.index >= this.defs.length) {
            this.onAllComplete();
            return;
        }

        const def = this.defs[this.index];
        this.currentDef = def;
        def.onStart?.();

        const mission = new Mission(
            def.title,
            def.position,
            this.scene,
            eventEmitter,
            0,
            def.helper ?? true,
            this.loading
        );
        this.active = mission;

        window.HUD?.setMission(def.id, def.title, def.instruction);

        const eventName = def.listenTo ?? 'collided';
        mission.addGameListener(eventName, (e) => {
            if (!def.check) return;
            if (!def.check(e as CustomEvent)) return;
            this.completeCurrent(mission, def);
        }, false);
    }

    private completeCurrent(mission: Mission, def: MissionDef) {
        mission.clearAllListeners();
        mission.finished();
        mission.removeMissionPoint(mission.missionPoint, this.scene);

        if (def.reward.money)  infoPlayer.money  += def.reward.money;
        if (def.reward.health) infoPlayer.health  = Math.min(100, infoPlayer.health + def.reward.health);
        if (def.reward.energy) infoPlayer.energy  = Math.min(100, infoPlayer.energy + def.reward.energy);

        const parts: string[] = [];
        if (def.reward.money)  parts.push(`+$${def.reward.money}`);
        if (def.reward.health) parts.push(`+${def.reward.health} vida`);
        if (def.reward.energy) parts.push(`+${def.reward.energy} bateria`);
        elementos.showMsg(`✅ ${def.title} — ${parts.join('  ')}`);

        window.HUD?.completeMission(def.id);
        def.onComplete?.();

        this.index++;
        setTimeout(() => this.launchCurrent(), 6000);
    }

    private onAllComplete() {
        showInstruction('🏆 Parabéns!', 'Você completou todas as missões do HackOS.');
        elementos.showMsg('🏆 Todas as missões concluídas!');
    }

    // ── API pública ───────────────────────────────────────────────────────────

    get missionPoint()    { return this.active?.missionPoint; }
    get missionPosition() { return this.active?.missionPoint.position; }
    get missionRadius()   { return this.currentDef?.radius ?? 2; }

    checkZone(playerPos: Vector3) {
        if (!this.active) return;
        this.active.checkMissionZone(
            playerPos,
            this.active.missionPoint.position,
            this.missionRadius
        );
    }

    /** Pula para uma missão específica por id — útil para debug */
    jumpTo(id: string) {
        const i = this.defs.findIndex(d => d.id === id);
        if (i === -1) {
            console.warn(`[MissionManager] missão "${id}" não encontrada`);
            return;
        }
        this.active?.clearAllListeners();
        if (this.active) {
            this.active.finished();
            this.active.removeMissionPoint(this.active.missionPoint, this.scene);
        }
        this.index = i;
        this.launchCurrent();
    }
}