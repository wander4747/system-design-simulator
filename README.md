# System Design Simulator

Simulador interativo de arquitetura. Você desenha um sistema (usuários, load balancer, servidores, cache, banco, fila), define a carga e vê **onde ele quebra**: quais componentes ficam lentos, quais saturam e o que os usuários sentem.

Roda inteiro no navegador, sem backend e sem dependências em produção.

## O que dá para fazer

- **Montar o diagrama:** adicionar componentes, arrastar, conectar (puxe o círculo da direita de um nó até outro) e remover (`Delete`).
- **Definir a carga:** slider de usuários, requisições por usuário, padrões de tráfego (constante, onda, rampa) e picos de ×3 e ×10.
- **Ver a distribuição:** o load balancer reparte o tráfego entre os servidores ligados, e cada conexão mostra o fluxo em rps.
- **Ver o estado de cada nó:** verde (ok), amarelo (lento), vermelho (sobrecarregado) ou cinza (fora do ar), com barra de carga e `rps / capacidade`.
- **Provocar falhas:** derrubar um nó específico ou um aleatório ("caos") e ver o impacto.
- **Entender o que quebrou:** o painel "Onde quebrou" explica a causa e sugere o que fazer. Os gráficos de latência, erros e RPS têm um ⓘ que explica cada métrica.
- **Partir de exemplos prontos:** leitura de usuário (cliente → servidor → banco), com load balancer, com cache e escrita assíncrona com fila.

## Como executar

Com Docker (imagem `node:alpine`, a versão mais recente do Node):

```bash
docker compose up
```

Ou direto com Node, sem instalar nada:

```bash
npm start
```

Depois abra <http://localhost:8080>. A simulação abre parada: clique em **▶ Iniciar**.

## Como o modelo funciona

É um modelo de fluido: a cada passo de 0,1 s simulado, o tráfego sai dos usuários e atravessa o grafo em ordem topológica (ciclos não são permitidos).

| Componente      | Comportamento                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Usuários        | Geram `usuários × req/usuário/s × multiplicador de carga` rps.                                                                                    |
| Load Balancer   | Divide entre os destinos saudáveis (health check). Algoritmos: round robin e menos carregado. Sem destino saudável, devolve erro.                 |
| Servidor, Banco | Capacidade finita em rps e fila limitada. Acima da capacidade a fila cresce, a latência sobe e, com a fila cheia, as requisições são descartadas. |
| Cache, CDN      | Respondem pelo `hit rate` e repassam o restante à origem. Se caírem, todo o tráfego vai direto para a origem (avalanche).                         |
| Fila            | Absorve picos até o tamanho máximo e drena em taxa fixa para os consumidores. O consumo é assíncrono e não entra na latência vista pelo usuário.  |

Cada nó tem um status (`ok`, `warn`, `bad`, `down`) a partir da taxa de descarte, da carga e do tempo de espera na fila. Sucesso e latência de ponta a ponta são calculados do fim para o início do grafo, combinando as dependências: elas se somam em sequência, e no load balancer e no cache são ponderadas pelo tráfego e pelo hit rate. O p99 é uma **estimativa** (latência média ampliada pela saturação do pior nó), não uma medição.

## Estrutura

```
src/
  engine/        motor da simulação, sem DOM
    types.js       tipos (JSDoc), configuração padrão e limites de cada nó
    graph.js       criação de nós, detecção de ciclo, ordem topológica, validação de grafos
    processors.js  regra de cada tipo de nó
    paths.js       sucesso e latência de ponta a ponta
    traffic.js     padrões de carga e picos
    diagnose.js    texto do "onde quebrou"
    simulation.js  classe Simulation
  ui/            interface
    app.js         estado compartilhado e eventos
    actions.js     únicas funções que alteram o estado
    canvas.js, inspector.js, metrics.js, controls.js, log.js, dom.js
    main.js        ponto de entrada e loop de animação
  presets.js     diagramas de exemplo
test/            testes do motor
server.mjs       servidor estático mínimo (usado pelo Docker e por npm start)
```

O motor não conhece a tela, e a interface só altera o estado por `actions.js`. As telas reagem a eventos em vez de chamarem umas às outras.

## Desenvolvimento

| Comando          | O que faz                                             |
| ---------------- | ----------------------------------------------------- |
| `npm install`    | Instala as ferramentas de desenvolvimento             |
| `npm test`       | Roda os testes do motor (`node:test`)                 |
| `npm run lint`   | ESLint (`npm run lint:fix` corrige o que for simples) |
| `npm run format` | Prettier (`npm run format:check` só verifica)         |
| `npm run check`  | Lint + formatação + testes                            |

Os testes cobrem o comportamento do motor (sobrecarga, balanceamento, falhas, cache, fila, reinício) e a validação de entrada. Comentários e nomes de testes ficam em inglês; textos exibidos ao usuário, em português.

## Segurança

- Não há `innerHTML` nem `eval`: nomes digitados entram apenas como texto.
- A página usa Content Security Policy restritiva (`default-src 'none'`, scripts e estilos só do próprio domínio).
- `normalizeGraph` valida qualquer grafo que venha de fora: limita nós e arestas, restringe tipos e faixas de valores e descarta ciclos.
- O servidor só entrega `index.html`, `style.css` e `src/`, e bloqueia caminhos que saiam dessa pasta. No Docker, o container roda sem privilégios, com sistema de arquivos somente leitura.

## Roadmap

Veja [ROADMAP.md](ROADMAP.md): CPU e RAM nos servidores, circuit breaker e retry storm, réplicas e sharding, rate limiter, modo desafio com custo, salvar/importar diagramas, entre outros.