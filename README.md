

# 🕹️ NetworkSim
Um jogo multiplayer baseado em rede, desenvolvido com foco em apresentação de conteúdo e interações em tempo real

![NetworkSim Banner](https://img.shields.io/badge/Status-Em%20Desenvolvimento-yellow)  
![GitHub Language Count](https://img.shields.io/github/languages/count/leonardo-ggomes/networksim)  
![GitHub Top Language](https://img.shields.io/github/languages/top/leonardo-ggomes/networksim)

---

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/m-r-davari/github_readme_beautifier/master/assets/github_meme_dark.gif">
  <img alt="Image changing depending on Dark/Light Github theme mode." src="https://raw.githubusercontent.com/m-r-davari/github_readme_beautifier/master/assets/github_meme_light.gif" width="100%">
</picture>

## 🚀 Funcionalidades

- 🎮 **Multiplayer em tempo real**: Conecte-se com outros jogadores através de uma arquitetura cliente-servidr.
- 🧠 **Situações desafiadoras**: Implemente várias missões.
- 🕹️ **Controles intuitivo**: Utilize o teclado para controlar seu jogador com comandos responsvos.

---

## 🧩 Estrutura do Projeto

```
networksim/
├── public/
├── src/
│   ├── controllers/
│   │   └── PlayerController.ts
│   ├── network/
│   │   └── SocketManager.ts
│   ├── utils/
│   └── index.ts
|   |___...
├── package.json
├── tsconfig.json
└── README.md
```

- **PlayerController.js**: Gerencia os comandos do jogador, incluindo movimentação e ções.
- **SocketManager.js**: Responsável pela comunicação entre cliente e servidor utilizando sokets.


## 🎮 Controles do Jogo

| Tecla | Ação             |
|-------|------------------|
| W     | Mover para cima  |
| A     | Mover para esquerda |
| S     | Mover para baixo |
| D     | Mover para direita |
| Shift + W     | Correr |
|T    | Habilita terminal |
|Tab    | Menu de ações |
|V    | Dança |

*Senha para ssh: server@2025*

---

## 🛠️ Tecnologias Utilizdas

- **Typescript**
- **Node.js**
- **Socket.io**
- **HTML5  CSS3**

---

## 📦 Instalação

1. Clone o repsitório:
   ````bash
   git clone https://github.com/leonardo-ggomes/networksim.git
   cd networksim
   

2. Instale as depedências:
   ````bash
   npm install
   

3. Inicie o ervidor:
   ````bash
   npm start
   

4. Abra o navegador e acesse `http://localhost:3000` para jogar.

---

## 📷 Capturas de Tela

![Tela Inicial](https://via.placeholder.com/800x400?text=Captura+deTela+1)
*Tela inicial do jogo com opções d conexão.*

![Gameplay](https://via.placeholder.com/800x400?text=Captura+deTela+2)
*Exemplo de gameplay com múltiplos jogadores cnectados.*

---

## 🤝 Contibuições

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues e pull requests.

---

##   Licença

Este projeto está licenciado sob a [MIT Licensa](LICENSE).

---

##📬 Contato

Desenvolvido por [Leonardo Gomes](https://github.com/leonardo-ggomes) - leonardogarciaoficial1@gmail.com

