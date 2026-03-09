/**
 * Missions.ts — HackOS
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROGRESSÃO PEDAGÓGICA — 24 missões em 6 fases
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
 * FASE 5 — PROGRAMAÇÃO EM JAVASCRIPT
 *   M16  Olá, Mundo! em JS                              (js:output)
 *   M17  Variáveis: let, const, template string         (js:output)
 *   M18  Arrow function + retorno                       (js:output)
 *   M19  Array + forEach                                (js:output)
 *   M20  Objeto literal + acesso a propriedades         (js:output)
 *   M21  Método de array: map + filter                  (js:output)
 *   M22  Recursão: fatorial — boss                      (js:output)
 *
 * FASE 6 — ENCERRAMENTO
 *   M23  Apresentação final no auditório                (collided)
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
 *   js:output         — detail: { output, source }          (emitido pelo JSInterpreter)
 *   collided          — detail: { collided }                (já existia)
 */

import { PerspectiveCamera, Scene, Vector3 }                  from "three";
import Mission                             from "./Mission";
import Loading                             from "./Loading";
import { infoPlayer }                      from "./InfoPlayer";
import { eventEmitter }                    from "./Actions";
import elementos                           from "./Actions";

declare global { interface Window { HUD?: any; Phone?: any } }

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

/** Normaliza saída do compilador C / interpretador JS */
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
    professor: new Vector3(-8, 0, 25),   // NPC professor
    sala:      new Vector3(   -25,    0,  10),   // zona de trabalho (terminal / C / JS)
    servidor:  new Vector3(  -25,    0,  22),   // sala do servidor remoto
    auditorio: new Vector3(   0,    1,  0),   // palco de encerramento
};

// ── Textos de arquivos injetados pelas missões ────────────────────────────────

const BRIEFING = `=== BRIEFING CONFIDENCIAL ===
Agente, voce foi selecionado para o Programa HackOS.
Sua missao: dominar o terminal Linux, a linguagem C
e JavaScript antes que o sistema seja comprometido.

Fases:
  1. Sistema de arquivos (ls cd pwd cat nano mkdir rm)
  2. Processos e seguranca (top ps kill)
  3. Rede (ifconfig ping ssh)
  4. Programacao em C (6 desafios)
  5. Programacao em JavaScript (7 desafios)

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
                window.Phone?.inbox.push({
                    id:    '__si_1',
                    title: `🎒 Bem-vindo ao HackOS`,
                    body:  `Voce chegou ao evento de tecnologia.
O professor esta com seu notebook.

Siga o marcador no mapa e
aproxime-se para receber o dispositivo.`,
                    type:  'info',
                });
                window.Phone?.chat.receive('ctOS', '📍 Encontre o professor para começar.');
            },
            check: (e) => (e.detail as any).collided === true,
            onComplete: () => {
                infoPlayer.hasTerminal = true;
                window.Phone?.inbox.push({
                    id:    '__si_2',
                    title: `✅ Notebook recebido!`,
                    body:  `Voce ganhou um notebook HackOS.

Pressione T para ligar o terminal
e iniciar sua jornada de hacker.`,
                    type:  'info',
                });
                window.Phone?.chat.receive('ctOS', '💻 Terminal desbloqueado! Pressione T.');
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
                window.Phone?.inbox.push({
                    id:    '__si_3',
                    title: `⚡ Primeiro Boot`,
                    body:  `Pressione T para ligar o terminal.

Observe a sequencia de inicializacao:
isso e o boot do sistema operacional.

Depois tente: help`,
                    type:  'info',
                });
                window.Phone?.chat.receive('ctOS', 'Pressione T para ligar o terminal.');
            },
            check: (_e) => true,
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_4',
                    title: `✅ HackOS Online!`,
                    body:  `Terminal inicializado com sucesso.

Dica: always type help to see
all available commands.`,
                    type:  'info',
                });
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
                window.Phone?.inbox.push({
                    id:    '__si_5',
                    title: `📂 Sistema de Arquivos`,
                    body:  `Tres comandos essenciais:

  ls       → lista arquivos e pastas
  cd home  → entra em /home/
  pwd      → mostra onde voce esta

Objetivo: execute pwd dentro de /home/`,
                    type:  'info',
                });
            },
            check: (e) => {
                const { dir } = (e.detail ?? {}) as any;
                return typeof dir === 'string' && dir.includes('home');
            },
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_6',
                    title: `✅ Navegação dominada!`,
                    body:  `ls, cd e pwd sao os comandos
mais usados no dia a dia Linux.

Agora leia o briefing secreto.`,
                    type:  'info',
                });
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
                window.Phone?.inbox.push({
                    id:    '__si_7',
                    title: `📄 Leitura de Arquivo`,
                    body:  `O arquivo briefing.txt foi plantado
em /home/ pelo professor.

Acesse-o com:
  cat briefing.txt

cat exibe o conteudo completo
de qualquer arquivo de texto.`,
                    type:  'info',
                });
            },
            check: (e) => (e.detail as any).file === 'briefing.txt',
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_8',
                    title: `✅ Briefing lido!`,
                    body:  `cat e essencial para ler logs,
configs e codigo no terminal.

Agora crie seu proprio arquivo.`,
                    type:  'info',
                });
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
                window.Phone?.inbox.push({
                    id:    '__si_9',
                    title: `✏️ Criando Arquivos`,
                    body:  `nano cria e edita arquivos.

Sintaxe:
  nano nome.ext "conteudo"

Execute:
  nano diario.txt "Missao iniciada"

Extensoes aceitas: .txt .js .py`,
                    type:  'info',
                });
            },
            check: (e) => {
                const { file, action } = (e.detail ?? {}) as any;
                return typeof file === 'string'
                    && file.match(/\.(txt|js|py)$/)
                    && action === 'created';
            },
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_10',
                    title: `✅ Arquivo criado!`,
                    body:  `Use cat diario.txt para reler.
nano nome.txt "novo texto"
sobrescreve o conteudo existente.`,
                    type:  'info',
                });
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
                window.Phone?.inbox.push({
                    id:    '__si_11',
                    title: `📁 Diretórios`,
                    body:  `mkdir cria novas pastas.

Execute: mkdir projetos

Depois verifique:
  ls        → voce vera "projetos"
  cd projetos → entra na pasta
  pwd         → confirma o caminho`,
                    type:  'info',
                });
            },
            check: (e) => typeof (e.detail as any).dir === 'string',
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_12',
                    title: `✅ Pasta criada!`,
                    body:  `Organize seus projetos em pastas.
Use rm arquivo.txt para remover
arquivos que nao precisa mais.`,
                    type:  'info',
                });
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
                    window.Phone?.inbox.push({
                        id:    '__si_13',
                        title: `🔍 Ameaça Detectada`,
                        body:  `O sistema esta lento!

Abra o terminal (T) e use:
  top      → monitor em tempo real
  ps aux   → lista todos os processos

Encontre o processo com maior %CPU
e anote o PID para eliminá-lo.`,
                        type:  'info',
                    });
                }, 400);
                window.Phone?.chat.receive('ctOS', '⚠️ Processo malicioso detectado no sistema!');
            },
            check: (_e) => true,
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_14',
                    title: `🔍 Processo identificado!`,
                    body:  `malware.exe — PID 4096 — 91% CPU

Agora encerre-o com:
  kill -9 4096`,
                    type:  'info',
                });
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
                setTimeout(() => window.Phone?.inbox.push({
                    id:    '__si_15',
                    title: `🦠 Elimine o Malware`,
                    body:  `malware.exe (PID 4096) esta consumindo
91% do CPU — o sistema vai travar!

Comando:
  kill -9 4096

-9 e o sinal SIGKILL:
encerra o processo imediatamente,
sem chance de ignorar.`,
                    type:  'info',
                }), 300);
                window.Phone?.chat.receive('ctOS', '🦠 Execute: kill -9 4096');
            },
            check: (e) => {
                const { processes } = e.detail as any;
                // Verifica apenas se o PID 4096 foi removido.
                // isCollided foi removido do check: o comando kill -9 é executado
                // no terminal que já está aberto — não depende de zona de colisão.
                return (processes as any[]).findIndex(p => p.pid === 4096) === -1;
            },
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_16',
                    title: `✅ Sistema limpo!`,
                    body:  `malware.exe foi encerrado.

Lição: kill -9 [PID] encerra
qualquer processo pelo seu ID.

Use top para confirmar que sumiu.`,
                    type:  'info',
                });
                (window as any).__experienceAmbientLight &&
                    ((window as any).__experienceAmbientLight.intensity = 0.8);
                window.Phone?.chat.receive('ctOS', '🛡️ Malware eliminado!');
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
            listenTo: 'terminal:ifconfig',
            onStart: () => {
                window.Phone?.inbox.push({
                    id:    '__si_17',
                    title: `🌐 Rede & Conectividade`,
                    body:  `Dois comandos essenciais:

  ifconfig
    mostra IP, mascara e gateway

  ping 192.168.1.1
    testa conexao com o roteador

Execute ambos para completar
o reconhecimento de rede.`,
                    type:  'info',
                });
            },
            check: (e) => typeof (e.detail as any).host === 'string',
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_18',
                    title: `✅ Rede mapeada!`,
                    body:  `Voce sabe verificar configuracao
de rede e testar conectividade.

Proxima etapa: acesso remoto SSH.`,
                    type:  'info',
                });
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
                window.Phone?.inbox.push({
                    id:    '__si_19',
                    title: `🔐 Acesso Remoto — SSH`,
                    body:  `SSH (Secure Shell) permite acessar
maquinas remotas pelo terminal.

Aproxime-se do servidor e execute:
  ssh server@2025

Apos conectar, ls lista os
arquivos do servidor remoto.
exit encerra a sessao.`,
                    type:  'info',
                });
                window.Phone?.chat.receive('ctOS', '🔐 Aproxime-se do servidor remoto.');
            },
            check: (e) => typeof (e.detail as any).address === 'string',
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_20',
                    title: `🔐 Sessão SSH ativa!`,
                    body:  `Voce esta no servidor remoto.

Os mesmos comandos funcionam:
ls, cat, nano, mkdir...

Use exit para voltar ao local.`,
                    type:  'info',
                });
                window.Phone?.chat.receive('ctOS', '🔐 Sessão SSH estabelecida!');
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
                window.Phone?.inbox.push({
                    id:    '__si_21',
                    title: `👨‍💻 C #1 — Olá Mundo`,
                    body:  `Abra o terminal → aba "Editor C"

#include <stdio.h>

int main() {
`,
                    type:  'info',
                })
            },
            check: (e) => norm((e.detail as any).output) === 'Ola, Mundo!',
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_22',
                    title: `✅ Primeiro programa C!`,
                    body:  `printf() imprime texto na tela.
Todo programa C comeca em main().
return 0 indica sucesso.`,
                    type:  'info',
                });
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
                window.Phone?.inbox.push({
                    id:    '__si_23',
                    title: `🔢 C #2 — Variáveis`,
                    body:  `int a = 7;
int b = 3;
`,
                    type:  'info',
                })
            },
            check: (e) => {
                const { output, source } = e.detail as any;
                return !isNaN(parseInt(norm(output), 10))
                    && /int\s+\w+\s*=/.test(source)
                    && /\+/.test(source);
            },
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_24',
                    title: `✅ Variáveis!`,
                    body:  `int, float e char sao os tipos
basicos de C.

%d → int     %f → float
%c → char    %s → string`,
                    type:  'info',
                });
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
                window.Phone?.inbox.push({
                    id:    '__si_25',
                    title: `🔀 C #3 — if / else`,
                    body:  `int n = 5;
if (n > 0) {
`,
                    type:  'info',
                })
            },
            check: (e) => {
                const { output, source } = e.detail as any;
                return /\bif\b/.test(source)
                    && /\belse\b/.test(source)
                    && (output.toLowerCase().includes('positivo')
                        || output.toLowerCase().includes('negativo'));
            },
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_26',
                    title: `✅ Condicionais!`,
                    body:  `if / else / else if permitem
que o programa tome decisoes.

Toda logica de negocio depende
de condicionais.`,
                    type:  'info',
                });
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
                window.Phone?.inbox.push({
                    id:    '__si_27',
                    title: `🔁 C #4 — Loop for`,
                    body:  `for (int i = 1; i <= 5; i++) {
`,
                    type:  'info',
                })
            },
            check: (e) => {
                const { output, source } = e.detail as any;
                return /\bfor\b/.test(source)
                    && hasLines(output, ['1','2','3','4','5']);
            },
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_28',
                    title: `✅ Loop dominado!`,
                    body:  `Loops automatizam repeticoes.

C tem tres tipos de loop:
  for    → quando sabe quantas vezes
  while  → enquanto condicao for true
  do/while → executa ao menos 1 vez`,
                    type:  'info',
                });
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
                window.Phone?.inbox.push({
                    id:    '__si_29',
                    title: `⚙️ C #5 — Funções`,
                    body:  `int mult(int a, int b) {
    return a * b;
}

int main() {
`,
                    type:  'info',
                })
            },
            check: (e) => {
                const { output, source } = e.detail as any;
                return /int\s+\w+\s*\(/.test(source)
                    && /return/.test(source)
                    && /\w+\s*\(\s*\d+\s*,\s*\d+\s*\)/.test(source)
                    && norm(output) === '20';
            },
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_30',
                    title: `🏆 Funções!`,
                    body:  `Funcoes encapsulam logica reutilizavel.

tipo retorno  nome  (parametros)

Sao o pilar da programacao estruturada
e base para orientacao a objetos.`,
                    type:  'info',
                });
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
                window.Phone?.inbox.push({
                    id:    '__si_31',
                    title: `🧠 C #6 — Recursão (Boss)`,
                    body:  `int fib(int n) {
    if (n <= 1) return n;
`,
                    type:  'info',
                })
                window.Phone?.chat.receive('ctOS', '🧠 Boss Challenge: Fibonacci recursivo!');
            },
            check: (e) => {
                const { output, source } = e.detail as any;
                return /int\s+\w+\s*\(\s*int/.test(source)       // funcao com param int
                    && /return\s+\w+\s*\(/.test(source)           // chamada recursiva
                    && /if\s*\(.*<=?\s*1/.test(source)            // caso base
                    && norm(output) === '13';
            },
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_32',
                    title: `🏆 Recursão dominada!`,
                    body:  `Recursao = funcao que chama a si mesma.

Sempre precisa de:
  1. Caso base (para a recursao)
  2. Chamada recursiva

Fibonacci e o exemplo classico!

Proximo desafio: JavaScript!`,
                    type:  'info',
                });
                window.Phone?.chat.receive('ctOS', '🏆 Boss Fibonacci concluído! Fase JS desbloqueada!');
            },
        },

        // ══════════════════════════════════════════════════════════════════════
        // FASE 5 — PROGRAMAÇÃO EM JAVASCRIPT
        // Todas usam listenTo: 'js:output' — detail: { output, source }
        // Emitido automaticamente pelo JSInterpreter.ts
        // ══════════════════════════════════════════════════════════════════════

        {
            id:    'js-hello',
            title: '🟨 JS #1 — Olá, Mundo!',
            instruction: 'No editor JS: use console.log() para imprimir  Olá, Mundo!',
            position: POS.sala,
            radius:   30,
            reward:   { money: 300, energy: 15 },
            helper:   true,
            listenTo: 'js:output',
            onStart: () => {
                window.Phone?.inbox.push({
                    id:    '__si_33',
                    title: `🟨 JavaScript #1 — Hello World`,
                    body:  `JavaScript roda direto no navegador!

`,
                    type:  'info',
                })
                window.Phone?.chat.receive('ctOS', '🟨 Fase JS desbloqueada! Abra o editor JavaScript.');
            },
            check: (e) => {
                const { output } = e.detail as any;
                return norm(output) === 'Olá, Mundo!';
            },
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_34',
                    title: `✅ console.log dominado!`,
                    body:  `console.log() exibe mensagens
no terminal do navegador.

Em C usávamos printf().
Em JS usamos console.log() —
mais simples, sem formatadores!`,
                    type:  'info',
                });
                window.Phone?.chat.receive('ctOS', '✅ Missão JS #1 concluída!');
            },
        },

        {
            id:    'js-vars',
            title: '🟨 JS #2 — let e const',
            instruction: 'Declare uma variável  nome  com seu nome e imprima:  Meu nome é [nome]',
            position: POS.sala,
            radius:   30,
            reward:   { money: 350, energy: 10 },
            helper:   true,
            listenTo: 'js:output',
            onStart: () => {
                window.Phone?.inbox.push({
                    id:    '__si_35',
                    title: `🟨 JavaScript #2 — Variáveis`,
                    body:  `let nome = "Hacker";
`,
                    type:  'info',
                })
            },
            check: (e) => {
                const { output, source } = e.detail as any;
                return /\b(let|const)\s+\w+/.test(source)        // declarou variável
                    && /`[^`]*\$\{/.test(source)                  // usou template string
                    && /Meu nome é .+/.test(output);              // saída correta
            },
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_36',
                    title: `✅ Variáveis JS!`,
                    body:  `Diferença C vs JS:

  C:  int x = 5;
  JS: let x = 5;   // qualquer tipo

JS é dinamicamente tipado —
não precisa declarar o tipo!

Template strings com crase
são muito mais práticas que printf!`,
                    type:  'info',
                });
                window.Phone?.chat.receive('ctOS', '✅ Missão JS #2 concluída!');
            },
        },

        {
            id:    'js-arrow',
            title: '🟨 JS #3 — Arrow Function',
            instruction: 'Crie uma arrow function  soma(a, b)  que retorna a + b. Imprima soma(3, 7).',
            position: POS.sala,
            radius:   30,
            reward:   { money: 400, energy: 10 },
            helper:   false,
            listenTo: 'js:output',
            onStart: () => {
                window.Phone?.inbox.push({
                    id:    '__si_37',
                    title: `🟨 JavaScript #3 — Arrow Function`,
                    body:  `const soma = (a, b) => a + b;

`,
                    type:  'info',
                })
            },
            check: (e) => {
                const { output, source } = e.detail as any;
                return /=>\s*([\w(]|\{)/.test(source)     // usou arrow function
                    && norm(output).includes('10');        // soma(3,7) = 10
            },
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_38',
                    title: `✅ Arrow Functions!`,
                    body:  `Duas formas de arrow function:

  Curta:  const f = x => x * 2;
  Longa:  const f = x => {
              return x * 2;
          };

A forma curta retorna automaticamente!`,
                    type:  'info',
                });
                window.Phone?.chat.receive('ctOS', '✅ Missão JS #3 concluída!');
            },
        },

        {
            id:    'js-array',
            title: '🟨 JS #4 — Array e forEach',
            instruction: 'Crie um array com 3 frutas e use forEach para imprimir cada uma.',
            position: POS.sala,
            radius:   30,
            reward:   { money: 450, energy: 10 },
            helper:   false,
            listenTo: 'js:output',
            onStart: () => {
                window.Phone?.inbox.push({
                    id:    '__si_39',
                    title: `🟨 JavaScript #4 — Arrays`,
                    body:  `const frutas = ["maça", "banana", "uva"];

frutas.forEach(f => {
`,
                    type:  'info',
                });
            },
            check: (e) => {
                const { output, source } = e.detail as any;
                const lines = output.split('\n').map((l: string) => l.trim()).filter(Boolean);
                return /\[.*,.*,.*\]/.test(source)        // criou array com 3+ itens
                    && /forEach/.test(source)              // usou forEach
                    && lines.length >= 3;                  // imprimiu pelo menos 3 linhas
            },
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_40',
                    title: `✅ Arrays em JS!`,
                    body:  `Arrays JS têm métodos poderosos:

  .forEach()  — itera todos
  .map()      — transforma cada item
  .filter()   — filtra por condição
  .push()     — adiciona ao final
  .length     — tamanho do array

Próxima missão: map e filter!`,
                    type:  'info',
                });
                window.Phone?.chat.receive('ctOS', '✅ Missão JS #4 concluída!');
            },
        },

        {
            id:    'js-object',
            title: '🟨 JS #5 — Objetos',
            instruction: 'Crie um objeto  agente  com  nome  e  nivel. Imprima: Agente [nome], nível [nivel].',
            position: POS.sala,
            radius:   30,
            reward:   { money: 500, energy: 10 },
            helper:   false,
            listenTo: 'js:output',
            onStart: () => {
                window.Phone?.inbox.push({
                    id:    '__si_41',
                    title: `🟨 JavaScript #5 — Objetos`,
                    body:  `const agente = {
    nome: "Neo",
    nivel: 7
};

console.log(
  \`Agente \${agente.nome}, nível \${agente.nivel}\`
`,
                    type:  'info',
                })
            },
            check: (e) => {
                const { output, source } = e.detail as any;
                return /\{[\s\S]*nome\s*:/.test(source)         // tem prop nome
                    && /\{[\s\S]*nivel\s*:/.test(source)        // tem prop nivel
                    && /Agente .+, n[íi]vel \d+/.test(output);  // saída correta
            },
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_42',
                    title: `✅ Objetos JS!`,
                    body:  `Objetos agrupam dados relacionados.

Formas de acesso:
  obj.prop      — dot notation
  obj["prop"]   — bracket notation

Desestruturação:
  const { nome, nivel } = agente;

Objetos são a base do JS moderno!`,
                    type:  'info',
                });
                window.Phone?.chat.receive('ctOS', '✅ Missão JS #5 concluída!');
            },
        },

        {
            id:    'js-map-filter',
            title: '🟨 JS #6 — map e filter',
            instruction: 'Dado o array [1,2,3,4,5]: filtre os pares e dobre cada um. Imprima o resultado.',
            position: POS.sala,
            radius:   30,
            reward:   { money: 600, energy: 15 },
            helper:   false,
            listenTo: 'js:output',
            onStart: () => {
                window.Phone?.inbox.push({
                    id:    '__si_43',
                    title: `🟨 JavaScript #6 — map + filter`,
                    body:  `const nums = [1, 2, 3, 4, 5];

const resultado = nums
    .filter(n => n % 2 === 0)  // pares: [2,4]
`,
                    type:  'info',
                })
            },
            check: (e) => {
                const { output, source } = e.detail as any;
                return /\.filter\(/.test(source)                              // usou filter
                    && /\.map\(/.test(source)                                 // usou map
                    && (output.includes('[4,8]') || output.includes('[4, 8]')); // resultado correto
            },
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_44',
                    title: `✅ map e filter!`,
                    body:  `Métodos funcionais de array:

  .filter(fn) → novo array com itens
               que passam na condição

  .map(fn)    → transforma cada item

  .reduce(fn) → combina tudo em 1 valor

Podem ser encadeados com ponto!
Último desafio JS chegando...`,
                    type:  'info',
                });
                window.Phone?.chat.receive('ctOS', '✅ Missão JS #6 concluída!');
            },
        },

        {
            // Boss challenge — recursão em JS
            id:    'js-recursion',
            title: '🧠 JS #7 — Fatorial Recursivo',
            instruction: 'Implemente fat(n) recursivo e imprima fat(5). Esperado: 120.',
            position: POS.sala,
            radius:   30,
            reward:   { money: 1200, health: 20, energy: 20 },
            helper:   false,
            listenTo: 'js:output',
            onStart: () => {
                window.Phone?.inbox.push({
                    id:    '__si_45',
                    title: `🧠 JS #7 — Recursão (Boss)`,
                    body:  `const fat = n => {
    if (n <= 1) return 1;
`,
                    type:  'info',
                })
                window.Phone?.chat.receive('ctOS', '🧠 Boss Challenge JS: Fatorial recursivo!');
            },
            check: (e) => {
                const { output, source } = e.detail as any;
                return (/=>\s*([\w(]|\{)/.test(source) || /function\s+\w+/.test(source))  // tem função
                    && /return\s+\w+\s*\*\s*\w+/.test(source)   // retorna n * algo
                    && /if\s*\(.*<=?\s*1/.test(source)           // caso base
                    && norm(output) === '120';
            },
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_46',
                    title: `🏆 Recursão JS dominada!`,
                    body:  `Você aprendeu recursão em 2 linguagens!

  C:  int fat(int n) { ... }
  JS: const fat = n => ...

O conceito é o mesmo:
  1. Caso base (para a recursão)
  2. Chamada recursiva

Agora vá ao auditório, hacker!`,
                    type:  'info',
                });
                window.Phone?.chat.receive('ctOS', '🏆 Boss JS Fatorial concluído! Formatura desbloqueada!');
            },
        },

        // ══════════════════════════════════════════════════════════════════════
        // FASE 6 — ENCERRAMENTO
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
                window.Phone?.inbox.push({
                    id:    '__si_47',
                    title: `🎤 Hora da Formatura`,
                    body:  `Voce completou todos os desafios!

Dirija-se ao auditório e
sente-se para a cerimonia final.

Parabens, Hacker!`,
                    type:  'info',
                });
                window.Phone?.chat.receive('ctOS', '🎤 Vá ao auditório para a formatura!');
            },
            check: (e) => (e.detail as any).collided === true,
            onComplete: () => {
                window.Phone?.inbox.push({
                    id:    '__si_48',
                    title: `🏆 Parabéns, Hacker!`,
                    body:  `Voce concluiu o HackOS!

✓ Sistema de arquivos
  ls  cd  pwd  cat  nano  mkdir  rm

✓ Processos e seguranca
  top  ps  kill -9

✓ Rede
  ifconfig  ping  ssh

✓ Programacao em C
  printf  int  if/else  for  funcao  recursao

✓ Programacao em JavaScript
  console.log  let/const  arrow fn
  array  objeto  map/filter  recursao

Voce esta pronto para o proximo nivel!`,
                    type:  'info',
                });
                window.Phone?.chat.receive('ctOS', '🏆 HackOS completo! Você é um hacker full-stack!');
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
        window.Phone?.inbox.push({
            id:    def.id,
            title: def.title,
            body:  def.instruction,
            type:  'mission',
        });

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

        // Atualiza o saldo e recarrega os cards da loja imediatamente.
        // Sem isso a aba Loja continua mostrando o saldo antigo até o player
        // fechar e reabrir o Phone manualmente.
        window.Phone?.refreshShop?.();

        const parts: string[] = [];
        if (def.reward.money)  parts.push(`+$${def.reward.money}`);
        if (def.reward.health) parts.push(`+${def.reward.health} vida`);
        if (def.reward.energy) parts.push(`+${def.reward.energy} bateria`);
        elementos.showMsg(`✅ ${def.title} — ${parts.join('  ')}`);

        window.HUD?.completeMission(def.id);
        window.Phone?.inbox.complete(def.id);
        def.onComplete?.();

        this.index++;
        setTimeout(() => this.launchCurrent(), 6000);
    }

    private onAllComplete() {
        window.Phone?.inbox.push({
            id:    '__si_49',
            title: `🏆 Parabéns, Hacker Full-Stack!`,
            body:  `Você completou todas as 24 missões do HackOS.

Habilidades conquistadas:
  Terminal Linux · C · JavaScript`,
            type:  'info',
        });
        elementos.showMsg('🏆 Todas as 24 missões concluídas!');
    }

    // ── API pública ───────────────────────────────────────────────────────────

    get missionPoint()    { return this.active?.missionPoint; }
    get missionPosition() { return this.active?.missionPoint.position; }
    get missionRadius()   { return this.currentDef?.radius ?? 2; }

    checkZone(playerPos: Vector3, camera?: PerspectiveCamera) {
        if (!this.active) return;
        this.active.checkMissionZone(
            playerPos,
            this.active.missionPoint.position,
            this.missionRadius
        );
        // Atualiza sprite do marcador (distância + animação)
        // delta não disponível aqui — tick usa clock interno baseado em Date
        this.active.tickMarker(0.016, playerPos);
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